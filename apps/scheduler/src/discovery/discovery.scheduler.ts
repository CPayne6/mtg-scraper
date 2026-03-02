import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { CacheService, DiscoveryRun } from '@scoutlgs/core';
import { DiscoveryService, DiscoveryResult } from './discovery.service';

export interface DiscoveryJobStatus {
  discoveryRunId: number;
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
export class DiscoveryScheduler implements OnModuleInit {
  private readonly logger = new Logger(DiscoveryScheduler.name);

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly cacheService: CacheService,
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    @InjectRepository(DiscoveryRun)
    private readonly discoveryRunRepository: Repository<DiscoveryRun>,
  ) {}

  onModuleInit() {
    const discoveryEnabled = this.configService.get<boolean>('discovery.enabled') ?? false;

    if (!discoveryEnabled) {
      this.logger.log('Discovery scheduling is disabled');
      return;
    }

    const cronTime = this.configService.get<string>('discovery.cronTime') ?? '0 1 * * *';
    const timezone = this.configService.get<string>('schedule.timezone') ?? 'America/Toronto';
    const runOnInit = this.configService.get<boolean>('discovery.runOnInit') ?? false;

    this.logger.log(
      `Discovery scheduled at cron time: ${cronTime} (${timezone})`,
    );

    const job = CronJob.from({
      cronTime,
      timeZone: timezone,
      onTick: () => {
        this.runDiscovery().catch((error) => {
          this.logger.error('Discovery cron job failed:', error);
        });
      },
      start: true,
      runOnInit,
    });

    this.schedulerRegistry.addCronJob('product-discovery', job);
    job.start();
  }

  async getJobStatus(): Promise<DiscoveryJobStatus | null> {
    const latestRun = await this.discoveryRunRepository.findOne({
      where: {},
      order: { startedAt: 'DESC' },
    });

    if (!latestRun) return null;

    return this.toJobStatus(latestRun);
  }

  async triggerDiscovery(options?: { skipExtraction?: boolean; trigger?: 'cron' | 'manual' }): Promise<{ message: string }> {
    // Mark any stale runs as failed
    await this.cleanupStaleRuns();

    // Check if there's already a running discovery
    const runningRun = await this.discoveryRunRepository.findOne({
      where: { status: 'running' },
    });

    if (runningRun) {
      return { message: 'Discovery already running' };
    }

    this.runDiscovery(options).catch((error) => {
      this.logger.error('Discovery trigger failed:', error);
    });

    return { message: 'Discovery triggered successfully' };
  }

  async runDiscovery(options?: { skipExtraction?: boolean; trigger?: 'cron' | 'manual' }): Promise<DiscoveryResult> {
    // Mark stale runs before starting
    await this.cleanupStaleRuns();

    this.logger.log('Queuing product discovery jobs...');

    try {
      const result = await this.discoveryService.discoverAllStores(1, {
        skipExtraction: options?.skipExtraction,
        trigger: options?.trigger ?? 'cron',
      });

      this.logger.log(
        `Discovery run #${result.discoveryRunId}: ${result.storesQueued} store jobs queued`,
      );

      return result;
    } catch (error) {
      this.logger.error('Discovery failed:', error);
      throw error;
    }
  }

  private toJobStatus(run: DiscoveryRun): DiscoveryJobStatus {
    return {
      discoveryRunId: run.id,
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
    const result = await this.discoveryRunRepository.update(
      { status: 'running', startedAt: LessThan(threshold) },
      { status: 'failed', completedAt: new Date() },
    );

    if (result.affected && result.affected > 0) {
      this.logger.warn(`Marked ${result.affected} stale discovery run(s) as failed`);
    }
  }
}
