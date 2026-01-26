import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as undici from 'undici';
import { Proxy } from './proxies/Proxy';
import { WebshareProxy } from './proxies/WebshareProxy';

interface ProxyItem {
  proxy: Proxy;
  disabled?: boolean;
}

@Injectable()
export class ProxyService implements OnModuleDestroy {
  private static readonly DEFAULT_POOL_CONNECTIONS = 50;
  private static readonly KEEP_ALIVE_TIMEOUT_MS = 60000;

  private readonly logger = new Logger(ProxyService.name);
  private readonly proxies: ProxyItem[];
  private proxyIndex = 0;
  private proxyAgent: undici.ProxyAgent | undefined;
  private readonly proxyEnabled: boolean;

  constructor(private configService: ConfigService) {
    // Credentials should be set via env vars (docker-entrypoint.sh loads secrets into env vars)
    const host = this.configService.get<string>(
      'WEBSHARE_HOST',
      'p.webshare.io',
    );
    const port = this.configService.get<string>('WEBSHARE_PORT', '80');
    const username = this.configService.get<string>('WEBSHARE_USERNAME', '');
    const password = this.configService.get<string>('WEBSHARE_PASSWORD', '');

    // Only enable proxy if credentials are provided
    this.proxyEnabled = !!(username && password);

    if (!this.proxyEnabled) {
      this.logger.warn(
        'Proxy credentials not configured (WEBSHARE_USERNAME/WEBSHARE_PASSWORD) - requests will use direct connection',
      );
      this.proxies = [];
      return;
    }

    this.proxies = [
      {
        proxy: new WebshareProxy(host, port, username, password),
      },
    ];

    this.logger.log(`Initialized proxy: ${host}:${port} (user: ${username})`);
  }

  /**
   * Check if proxy is enabled and configured.
   */
  isEnabled(): boolean {
    return this.proxyEnabled;
  }

  /**
   * Get the next proxy in a round-robin fashion.
   * Returns undefined if proxy is not enabled.
   */
  getProxy(): Proxy | undefined {
    if (!this.proxyEnabled || this.proxies.length === 0) {
      return undefined;
    }
    return this.proxies[this.proxyIndex].proxy;
  }

  /**
   * Get a shared ProxyAgent with connection pooling.
   * The agent is lazily created on first call and reused for all subsequent requests.
   * Returns undefined if proxy is not enabled.
   */
  getProxyAgent(): undici.ProxyAgent | undefined {
    if (!this.proxyEnabled) {
      return undefined;
    }

    const proxy = this.getProxy();
    if (!proxy) return undefined;

    if (!this.proxyAgent) {
      const poolConnections = this.configService.get<number>(
        'PROXY_POOL_CONNECTIONS',
        ProxyService.DEFAULT_POOL_CONNECTIONS,
      );

      this.proxyAgent = new undici.ProxyAgent({
        uri: 'http://' + proxy.toString(),
        connections: poolConnections,
        keepAliveTimeout: ProxyService.KEEP_ALIVE_TIMEOUT_MS,
      });
      this.logger.log(
        `Created shared ProxyAgent with ${poolConnections} connections`,
      );
    }

    return this.proxyAgent;
  }

  async onModuleDestroy() {
    if (this.proxyAgent) {
      await this.proxyAgent.close();
      this.logger.log('ProxyAgent connections closed');
    }
  }
}
