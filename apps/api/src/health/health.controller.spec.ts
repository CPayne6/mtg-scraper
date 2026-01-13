import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService, HealthStatus } from './health.service';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('HealthController', () => {
  let controller: HealthController;
  let healthService: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const mockHealthService = {
      check: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: mockHealthService }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    healthService = module.get(HealthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('check', () => {
    it('should return health check result with status ok', async () => {
      const healthResult: HealthStatus = {
        status: 'ok',
        info: {},
        error: {},
        details: {},
      };
      healthService.check.mockResolvedValue(healthResult);

      const result = await controller.check();

      expect(healthService.check).toHaveBeenCalled();
      expect(result.status).toBe('ok');
    });

    it('should return health check result with status error', async () => {
      const healthResult: HealthStatus = {
        status: 'error',
        info: {},
        error: { database: { status: 'down' } },
        details: { database: { status: 'down' } },
      };
      healthService.check.mockResolvedValue(healthResult);

      const result = await controller.check();

      expect(healthService.check).toHaveBeenCalled();
      expect(result.status).toBe('error');
    });

    it('should call health check service', async () => {
      const healthResult: HealthStatus = {
        status: 'ok',
        info: {},
        error: {},
        details: {},
      };
      healthService.check.mockResolvedValue(healthResult);

      await controller.check();

      expect(healthService.check).toHaveBeenCalledTimes(1);
    });
  });
});
