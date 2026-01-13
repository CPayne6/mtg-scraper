import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ProxyService } from './proxy.service';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('ProxyService', () => {
  let service: ProxyService;
  let mockConfigServiceGet: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    mockConfigServiceGet = vi.fn((key: string, defaultValue?: string) => {
      const config: Record<string, string> = {
        WEBSHARE_HOST: 'p.webshare.io',
        WEBSHARE_PORT: '80',
        WEBSHARE_USERNAME: 'test-user',
        WEBSHARE_PASSWORD: 'test-pass',
      };
      return config[key] || defaultValue;
    });

    const mockConfigService = {
      get: mockConfigServiceGet,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProxyService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<ProxyService>(ProxyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getProxy', () => {
    it('should return a proxy', () => {
      const proxy = service.getProxy();

      expect(proxy).toBeDefined();
      expect(proxy.name).toBeDefined();
    });

    it('should return same proxy on multiple calls (single proxy configured)', () => {
      const firstProxy = service.getProxy();
      const secondProxy = service.getProxy();

      // With single proxy, should get the same one
      expect(firstProxy).toBeDefined();
      expect(secondProxy).toBeDefined();
      expect(firstProxy.name).toBe(secondProxy.name);
    });
  });

  describe('initialization', () => {
    it('should initialize with Webshare configuration from environment', () => {
      expect(mockConfigServiceGet).toHaveBeenCalledWith('WEBSHARE_HOST', 'p.webshare.io');
      expect(mockConfigServiceGet).toHaveBeenCalledWith('WEBSHARE_PORT', '80');
      expect(mockConfigServiceGet).toHaveBeenCalledWith('WEBSHARE_USERNAME', '');
      expect(mockConfigServiceGet).toHaveBeenCalledWith('WEBSHARE_PASSWORD', '');
    });

    it('should initialize with single Webshare proxy', () => {
      const proxy = service.getProxy();

      expect(proxy).toBeDefined();
      expect(proxy.name).toBe('Webshare');
    });
  });
});
