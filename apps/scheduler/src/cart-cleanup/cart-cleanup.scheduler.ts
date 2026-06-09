import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { CartCleanupService } from './cart-cleanup.service';

@Injectable()
export class CartCleanupScheduler implements OnModuleInit {
  private readonly logger = new Logger(CartCleanupScheduler.name);

  constructor(
    private readonly cartCleanupService: CartCleanupService,
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onModuleInit(): void {
    const enabled =
      this.configService.get<boolean>('cartCleanup.enabled') ?? true;
    if (!enabled) {
      this.logger.log('Cart cleanup scheduling is disabled');
      return;
    }

    const cronTime =
      this.configService.get<string>('cartCleanup.cronTime') ?? '0 3 * * *';
    const timezone =
      this.configService.get<string>('schedule.timezone') ?? 'America/Toronto';

    const job = CronJob.from({
      cronTime,
      timeZone: timezone,
      onTick: () => {
        this.runCleanup().catch((error) => {
          this.logger.error('Cart cleanup cron failed:', error);
        });
      },
      start: true,
    });

    this.schedulerRegistry.addCronJob('cart-cleanup', job);
    job.start();
    this.logger.log(`Cart cleanup scheduled at: ${cronTime} (${timezone})`);
  }

  async runCleanup(): Promise<number> {
    const retentionDays =
      this.configService.get<number>('cartCleanup.anonymousRetentionDays') ??
      30;
    return this.cartCleanupService.deleteExpiredAnonymousCarts(retentionDays);
  }
}
