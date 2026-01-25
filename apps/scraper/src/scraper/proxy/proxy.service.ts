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

  constructor(private configService: ConfigService) {
    // Only initialize with Webshare proxy service because we pay for it
    this.proxies = [
      {
        proxy: new WebshareProxy(
          this.configService.get<string>('WEBSHARE_HOST', 'p.webshare.io'),
          this.configService.get<string>('WEBSHARE_PORT', '80'),
          this.configService.get<string>('WEBSHARE_USERNAME', ''),
          this.configService.get<string>('WEBSHARE_PASSWORD', ''),
        ),
      },
    ];

    this.logger.log(`Initialized ${this.proxies.length} proxies`);
  }

  /**
   * Get the next proxy in a round-robin fashion
   */
  getProxy(): Proxy {
    return this.proxies[this.proxyIndex].proxy;
  }

  /**
   * Get a shared ProxyAgent with connection pooling.
   * The agent is lazily created on first call and reused for all subsequent requests.
   */
  getProxyAgent(): undici.ProxyAgent | undefined {
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
