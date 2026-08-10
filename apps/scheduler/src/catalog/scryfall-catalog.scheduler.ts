import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { ScryfallCatalogService } from './scryfall-catalog.service';

@Injectable()
export class ScryfallCatalogScheduler implements OnModuleInit {
  private readonly logger = new Logger(ScryfallCatalogScheduler.name);
  constructor(private readonly catalog: ScryfallCatalogService, private readonly config: ConfigService, private readonly registry: SchedulerRegistry) {}

  onModuleInit(): void {
    if (!(this.config.get<boolean>('scryfallCatalog.enabled') ?? true)) return;
    const cronTime = this.config.get<string>('scryfallCatalog.cronTime') ?? '0 0 * * *';
    const timezone = this.config.get<string>('schedule.timezone') ?? 'America/Toronto';
    const job = CronJob.from({
      cronTime,
      timeZone: timezone,
      start: true,
      onTick: async () => {
        try {
          await this.catalog.syncMissingSets();
        } catch (error) {
          this.logger.error('Scryfall set check failed', error);
        }
      },
    });
    this.registry.addCronJob('scryfall-catalog-sync', job);
    job.start();
    this.logger.log(`Scryfall set check scheduled at: ${cronTime} (${timezone})`);
  }
}
