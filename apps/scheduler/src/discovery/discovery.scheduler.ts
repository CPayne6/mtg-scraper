import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { CacheService } from '@scoutlgs/core';
import { DiscoveryService, DiscoveryResult } from './discovery.service';

export interface DiscoveryJobStatus {
  initiatedAt: number;
  finishedAt?: number;
  status: 'running' | 'completed' | 'failed';
  details?: {
    storesQueued: number;
    storeNames: string[];
  };
}

@Injectable()
export class DiscoveryScheduler implements OnModuleInit {
  private readonly logger = new Logger(DiscoveryScheduler.name);
  private currentJobStatus: DiscoveryJobStatus | null = null;

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly cacheService: CacheService,
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
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

  getJobStatus(): DiscoveryJobStatus | null {
    return this.currentJobStatus;
  }

  async triggerDiscovery(): Promise<{ message: string }> {
    if (this.currentJobStatus?.status === 'running') {
      return { message: 'Discovery already running' };
    }

    this.runDiscovery().catch((error) => {
      this.logger.error('Discovery trigger failed:', error);
    });

    return { message: 'Discovery triggered successfully' };
  }

  async runDiscovery(): Promise<DiscoveryResult> {
    const initiatedAt = Date.now();

    this.currentJobStatus = {
      initiatedAt,
      status: 'running',
    };

    this.logger.log('Queuing product discovery jobs...');

    try {
      const result = await this.discoveryService.discoverAllStores();

      this.currentJobStatus = {
        initiatedAt,
        finishedAt: Date.now(),
        status: 'completed',
        details: {
          storesQueued: result.storesQueued,
          storeNames: result.storeNames,
        },
      };

      const duration = (Date.now() - initiatedAt) / 1000;
      this.logger.log(
        `Discovery jobs queued: ${result.storesQueued} stores in ${duration.toFixed(1)}s`,
      );

      return result;
    } catch (error) {
      this.currentJobStatus = {
        initiatedAt,
        finishedAt: Date.now(),
        status: 'failed',
      };

      this.logger.error('Discovery failed:', error);
      throw error;
    }
  }
}
