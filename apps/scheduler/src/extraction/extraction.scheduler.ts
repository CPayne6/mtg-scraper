import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { CacheService, ExtractionRun } from '@scoutlgs/core';
import { ExtractionOrchestrator, ExtractionRunResult } from './extraction-orchestrator.service';

export interface ExtractionJobStatus {
  extractionRunId: number;
  initiatedAt: string;
  finishedAt?: string;
  status: 'running' | 'completed' | 'failed';
  trigger: string;
  skipExtraction: boolean;
  storesTotal: number;
  storesCompleted: number;
  storesFailed: number;
  totalDiscovered: number;
  totalNewProducts: number;
  totalUpdatedProducts: number;
  totalExtractionJobsQueued: number;
  totalErrors: number;
  extractionsSucceeded: number;
  extractionsFailed: number;
}

/** How long a run can stay 'running' before we consider it stale (6 hours). */
const STALE_RUN_THRESHOLD_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class ExtractionScheduler implements OnModuleInit {
  private readonly logger = new Logger(ExtractionScheduler.name);

  constructor(
    private readonly extractionOrchestrator: ExtractionOrchestrator,
    private readonly cacheService: CacheService,
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    @InjectRepository(ExtractionRun)
    private readonly extractionRunRepository: Repository<ExtractionRun>,
  ) {}

  onModuleInit() {
    const enabled = this.configService.get<boolean>('extraction.enabled') ?? false;
    if (!enabled) {
      this.logger.log('Extraction scheduling is disabled');
      return;
    }

    const timezone = this.configService.get<string>('schedule.timezone') ?? 'America/Toronto';
    const runOnInit = this.configService.get<boolean>('extraction.runOnInit') ?? false;

    // Nightly full crawl
    const fullCronTime = this.configService.get<string>('extraction.cronTime') ?? '0 1 * * *';
    this.logger.log(`Full extraction scheduled at: ${fullCronTime} (${timezone})`);
    const fullJob = CronJob.from({
      cronTime: fullCronTime,
      timeZone: timezone,
      onTick: () => {
        this.runExtraction({ incremental: false }).catch((error) => {
          this.logger.error('Full extraction cron failed:', error);
        });
      },
      start: true,
      runOnInit,
    });
    this.schedulerRegistry.addCronJob('extraction-full', fullJob);
    fullJob.start();

    // Hourly incremental refresh
    const incrementalEnabled =
      this.configService.get<boolean>('extraction.incrementalEnabled') ?? false;
    if (incrementalEnabled) {
      const incrementalCronTime =
        this.configService.get<string>('extraction.incrementalCronTime') ?? '0 9-21 * * *';
      this.logger.log(
        `Incremental extraction scheduled at: ${incrementalCronTime} (${timezone})`,
      );
      const incJob = CronJob.from({
        cronTime: incrementalCronTime,
        timeZone: timezone,
        onTick: () => {
          this.runExtraction({ incremental: true }).catch((error) => {
            this.logger.error('Incremental extraction cron failed:', error);
          });
        },
        start: true,
      });
      this.schedulerRegistry.addCronJob('extraction-incremental', incJob);
      incJob.start();
    }
  }

  async getJobStatus(): Promise<ExtractionJobStatus | null> {
    const latestRun = await this.extractionRunRepository.findOne({
      where: {},
      order: { startedAt: 'DESC' },
    });

    if (!latestRun) return null;

    return this.toJobStatus(latestRun);
  }

  async triggerExtractionRun(options?: {
    skipExtraction?: boolean;
    trigger?: 'cron' | 'manual';
    incremental?: boolean;
  }): Promise<{ message: string }> {
    await this.cleanupStaleRuns();

    const runningRun = await this.extractionRunRepository.findOne({
      where: { status: 'running' },
    });

    if (runningRun) {
      return { message: 'Extraction already running' };
    }

    this.runExtraction(options).catch((error) => {
      this.logger.error('Extraction trigger failed:', error);
    });

    return { message: 'Extraction triggered successfully' };
  }

  async runExtraction(options?: {
    skipExtraction?: boolean;
    trigger?: 'cron' | 'manual';
    incremental?: boolean;
  }): Promise<ExtractionRunResult> {
    await this.cleanupStaleRuns();

    this.logger.log(
      `Queuing extraction jobs${options?.incremental ? ' (incremental)' : ''}...`,
    );

    try {
      const result = await this.extractionOrchestrator.queueExtractionForAllStores(1, {
        skipExtraction: options?.skipExtraction,
        trigger: options?.trigger ?? 'cron',
        incremental: options?.incremental,
      });

      this.logger.log(
        `Extraction run #${result.extractionRunId}: ${result.storesQueued} store jobs queued` +
          (result.updatedSince ? ` (since ${result.updatedSince})` : ''),
      );

      return result;
    } catch (error) {
      this.logger.error('Extraction failed:', error);
      throw error;
    }
  }

  private toJobStatus(run: ExtractionRun): ExtractionJobStatus {
    return {
      extractionRunId: run.id,
      initiatedAt: run.startedAt.toISOString(),
      finishedAt: run.completedAt?.toISOString(),
      status: run.status,
      trigger: run.trigger,
      skipExtraction: run.skipExtraction,
      storesTotal: run.storesTotal,
      storesCompleted: run.storesCompleted,
      storesFailed: run.storesFailed,
      totalDiscovered: run.totalDiscovered,
      totalNewProducts: run.totalNewProducts,
      totalUpdatedProducts: run.totalUpdatedProducts,
      totalExtractionJobsQueued: run.totalExtractionJobsQueued,
      totalErrors: run.totalErrors,
      extractionsSucceeded: run.extractionsSucceeded,
      extractionsFailed: run.extractionsFailed,
    };
  }

  private async cleanupStaleRuns(): Promise<void> {
    const threshold = new Date(Date.now() - STALE_RUN_THRESHOLD_MS);
    const result = await this.extractionRunRepository.update(
      { status: 'running', startedAt: LessThan(threshold) },
      { status: 'failed', completedAt: new Date() },
    );

    if (result.affected && result.affected > 0) {
      this.logger.warn(`Marked ${result.affected} stale extraction run(s) as failed`);
    }
  }
}
