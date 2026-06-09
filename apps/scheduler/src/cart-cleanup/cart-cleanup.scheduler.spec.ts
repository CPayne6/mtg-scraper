import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CartCleanupScheduler } from './cart-cleanup.scheduler';

describe('CartCleanupScheduler', () => {
  let cleanupService: { deleteExpiredAnonymousCarts: ReturnType<typeof vi.fn> };
  let configService: { get: ReturnType<typeof vi.fn> };
  let scheduler: CartCleanupScheduler;

  beforeEach(() => {
    cleanupService = {
      deleteExpiredAnonymousCarts: vi.fn().mockResolvedValue(2),
    };
    configService = {
      get: vi.fn((key: string) => {
        if (key === 'cartCleanup.anonymousRetentionDays') return 30;
        return undefined;
      }),
    };
    scheduler = new CartCleanupScheduler(
      cleanupService as any,
      configService as any,
      { addCronJob: vi.fn() } as any,
    );
  });

  it('runs cleanup with the configured retention period', async () => {
    await expect(scheduler.runCleanup()).resolves.toBe(2);

    expect(cleanupService.deleteExpiredAnonymousCarts).toHaveBeenCalledWith(30);
  });
});
