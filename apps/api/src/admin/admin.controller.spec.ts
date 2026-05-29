import { ExecutionContext, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminGuard } from '../auth/admin.guard';
import { PrincipalGuard } from '../auth/principal.guard';
import { PrincipalJwtService } from '../auth/principal-jwt.service';
import type { PrincipalContext } from '../auth/principal.types';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

const makeContext = (principal?: PrincipalContext): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ principal }),
    }),
  }) as unknown as ExecutionContext;

describe('AdminController', () => {
  let adminService: Record<string, ReturnType<typeof vi.fn>>;
  let principalGuard: { canActivate: ReturnType<typeof vi.fn> };
  let adminGuard: AdminGuard;
  let controller: AdminController;

  beforeEach(async () => {
    adminService = {
      triggerStorefront: vi.fn().mockResolvedValue({ ok: true }),
      triggerStorefrontAll: vi.fn().mockResolvedValue({ ok: true }),
      getStorefrontStatus: vi.fn().mockResolvedValue({ status: 'idle' }),
      triggerExtraction: vi.fn().mockResolvedValue({ ok: true }),
      getExtractionStatus: vi.fn().mockResolvedValue({ status: 'idle' }),
      listExtractionRuns: vi.fn().mockResolvedValue({ runs: [] }),
      getExtractionRun: vi.fn().mockResolvedValue({ id: 7 }),
      reextractUnmatched: vi.fn().mockResolvedValue({ ok: true }),
      getUnmatchedStats: vi.fn().mockResolvedValue({ count: 0 }),
      sweepFailed: vi.fn().mockResolvedValue({ swept: 0 }),
    };
    principalGuard = { canActivate: vi.fn().mockResolvedValue(true) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: AdminService, useValue: adminService },
        AdminGuard,
        { provide: PrincipalGuard, useValue: principalGuard },
        { provide: PrincipalJwtService, useValue: { verifyRequest: vi.fn() } },
      ],
    }).compile();

    controller = module.get(AdminController);
    adminGuard = module.get(AdminGuard);
  });

  it('forwards storefront trigger params and lets admin principals through', async () => {
    await expect(
      adminGuard.canActivate(
        makeContext({
          principalUuid: 'p',
          kind: 'user',
          role: 'admin',
        }),
      ),
    ).resolves.toBe(true);

    await controller.triggerStorefront(2, 4, true);

    expect(adminService.triggerStorefront).toHaveBeenCalledWith({
      storeId: 2,
      splitRanges: 4,
      incremental: true,
    });
  });

  it('rejects non-admin user principals', async () => {
    await expect(
      adminGuard.canActivate(
        makeContext({
          principalUuid: 'p',
          kind: 'user',
          role: 'user',
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns 404 for anonymous principals so admin surface stays hidden', async () => {
    await expect(
      adminGuard.canActivate(
        makeContext({ principalUuid: 'p', kind: 'anonymous' }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns 404 when no principal is attached', async () => {
    await expect(
      adminGuard.canActivate(makeContext(undefined)),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns 404 when the underlying PrincipalGuard rejects', async () => {
    principalGuard.canActivate.mockRejectedValueOnce(new Error('no token'));
    await expect(
      adminGuard.canActivate(makeContext(undefined)),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('exposes extraction list, detail, and maintenance endpoints', async () => {
    await controller.listExtractionRuns(10);
    expect(adminService.listExtractionRuns).toHaveBeenCalledWith(10);

    await controller.getExtractionRun(42);
    expect(adminService.getExtractionRun).toHaveBeenCalledWith(42);

    await controller.reextractUnmatched(3, 50);
    expect(adminService.reextractUnmatched).toHaveBeenCalledWith({
      storeId: 3,
      limit: 50,
    });

    await controller.sweepFailed(0);
    expect(adminService.sweepFailed).toHaveBeenCalledWith(0);

    await controller.getUnmatchedStats();
    expect(adminService.getUnmatchedStats).toHaveBeenCalled();
  });
});
