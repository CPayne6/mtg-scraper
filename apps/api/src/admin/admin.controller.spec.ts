import { ExecutionContext, ForbiddenException } from '@nestjs/common';
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
      triggerScheduler: vi.fn().mockResolvedValue({ message: 'ok' }),
      getSchedulerStatus: vi.fn().mockResolvedValue({ status: 'idle' }),
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

  it('lets admin principals trigger the scheduler', async () => {
    await expect(
      adminGuard.canActivate(
        makeContext({
          principalUuid: 'p',
          kind: 'user',
          role: 'admin',
        }),
      ),
    ).resolves.toBe(true);

    const result = await controller.triggerScheduler('250');

    expect(adminService.triggerScheduler).toHaveBeenCalledWith(250);
    expect(result).toEqual({ message: 'ok' });
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
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects anonymous principals', async () => {
    await expect(
      adminGuard.canActivate(
        makeContext({ principalUuid: 'p', kind: 'anonymous' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects missing principals', async () => {
    await expect(
      adminGuard.canActivate(makeContext(undefined)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('parses the scheduler status request', async () => {
    const result = await controller.getSchedulerStatus();
    expect(adminService.getSchedulerStatus).toHaveBeenCalled();
    expect(result).toEqual({ status: 'idle' });
  });
});
