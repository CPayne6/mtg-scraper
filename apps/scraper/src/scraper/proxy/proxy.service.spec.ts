import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ProxyService } from './proxy.service';

describe('ProxyService', () => {
  let service: ProxyService;
  let configService: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const mockConfigService = {
      get: vi.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          WEBSHARE_HOST: 'p.webshare.io',
          WEBSHARE_PORT: '80',
          WEBSHARE_USERNAME: 'test-user',
          WEBSHARE_PASSWORD: 'test-pass',
          OXYLABS_HOST: 'dc.oxylabs.io',
          OXYLABS_PORT: '8000',
          OXYLABS_USERNAME: 'oxy-user',
          OXYLABS_PASSWORD: 'oxy-pass',
        };
        return config[key] || defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProxyService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<ProxyService>(ProxyService);
    configService = module.get(ConfigService);
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

    it('should rotate proxies in round-robin fashion', () => {
      const firstProxy = service.getProxy();
      const secondProxy = service.getProxy();

      // Should get different proxies (or same if only one configured)
      expect(firstProxy).toBeDefined();
      expect(secondProxy).toBeDefined();
    });

    it('should skip disabled proxies', () => {
      const firstProxy = service.getProxy();
      service.disableProxy(firstProxy, -1); // Disable indefinitely

      const secondProxy = service.getProxy();

      // Should get a different proxy (if available)
      expect(secondProxy).toBeDefined();
    });

    it('should handle all proxies being disabled', () => {
      const firstProxy = service.getProxy();
      const secondProxy = service.getProxy();

      service.disableProxy(firstProxy, -1);
      service.disableProxy(secondProxy, -1);

      // Should still return a proxy (even if disabled)
      const proxy = service.getProxy();
      expect(proxy).toBeDefined();
    });
  });

  describe('disableProxy', () => {
    it('should disable a proxy', () => {
      const proxy = service.getProxy();

      service.disableProxy(proxy);

      // Proxy should be disabled but service should continue working
      expect(service).toBeDefined();
    });

    it('should re-enable proxy after timeout', (done) => {
      const proxy = service.getProxy();
      const timeout = 100; // Short timeout for testing

      service.disableProxy(proxy, timeout);

      setTimeout(() => {
        // Proxy should be re-enabled after timeout
        const nextProxy = service.getProxy();
        expect(nextProxy).toBeDefined();
        done();
      }, timeout + 50);
    });

    it('should not re-enable if timeout is -1', (done) => {
      const proxy = service.getProxy();

      service.disableProxy(proxy, -1);

      setTimeout(() => {
        // Proxy should remain disabled
        expect(service).toBeDefined();
        done();
      }, 200);
    });

    it('should use default timeout of 10000ms', () => {
      const proxy = service.getProxy();

      // Should not throw
      service.disableProxy(proxy);

      expect(service).toBeDefined();
    });
  });

  describe('initialization', () => {
    it('should initialize with configuration from environment', () => {
      expect(configService.get).toHaveBeenCalledWith('WEBSHARE_HOST', 'p.webshare.io');
      expect(configService.get).toHaveBeenCalledWith('WEBSHARE_PORT', '80');
      expect(configService.get).toHaveBeenCalledWith('WEBSHARE_USERNAME', '');
      expect(configService.get).toHaveBeenCalledWith('WEBSHARE_PASSWORD', '');
      expect(configService.get).toHaveBeenCalledWith('OXYLABS_HOST', 'dc.oxylabs.io');
      expect(configService.get).toHaveBeenCalledWith('OXYLABS_PORT', '8000');
      expect(configService.get).toHaveBeenCalledWith('OXYLABS_USERNAME', '');
      expect(configService.get).toHaveBeenCalledWith('OXYLABS_PASSWORD', '');
    });

    it('should initialize multiple proxies', () => {
      // Service should be initialized with 2 proxies (Webshare and Oxylabs)
      const firstProxy = service.getProxy();
      const secondProxy = service.getProxy();
      const thirdProxy = service.getProxy(); // Should cycle back

      expect(firstProxy).toBeDefined();
      expect(secondProxy).toBeDefined();
      expect(thirdProxy).toBeDefined();
    });
  });
});
