import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthCheckService, HealthCheckResult } from '@nestjs/terminus';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('HealthController', () => {
  let controller: HealthController;
  let healthCheckService: ReturnType<typeof vi.mocked<HealthCheckService>>;

  beforeEach(async () => {
    const mockHealthCheckService = {
      check: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthCheckService, useValue: mockHealthCheckService }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    healthCheckService = module.get(HealthCheckService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('check', () => {
    it('should return health check result with status ok', async () => {
      const healthResult: HealthCheckResult = {
        status: 'ok',
        info: {},
        error: {},
        details: {},
      };
      healthCheckService.check.mockResolvedValue(healthResult);

      const result = await controller.check();

      expect(healthCheckService.check).toHaveBeenCalledWith([]);
      expect(result.status).toBe('ok');
    });

    it('should return health check result with status error', async () => {
      const healthResult: HealthCheckResult = {
        status: 'error',
        info: {},
        error: { database: { status: 'down' } },
        details: { database: { status: 'down' } },
      };
      healthCheckService.check.mockResolvedValue(healthResult);

      const result = await controller.check();

      expect(healthCheckService.check).toHaveBeenCalledWith([]);
      expect(result.status).toBe('error');
    });

    it('should call health check with empty indicators array', async () => {
      const healthResult: HealthCheckResult = {
        status: 'ok',
        info: {},
        error: {},
        details: {},
      };
      healthCheckService.check.mockResolvedValue(healthResult);

      await controller.check();

      expect(healthCheckService.check).toHaveBeenCalledWith([]);
      expect(healthCheckService.check).toHaveBeenCalledTimes(1);
    });
  });
});
