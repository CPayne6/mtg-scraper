import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as undici from 'undici';
import { CacheService } from '../cache/cache.service';
import { LRUCache } from 'lru-cache';

@Injectable()
export class ProxyService implements OnModuleDestroy {
  private static readonly DEFAULT_POOL_CONNECTIONS = 10;
  private static readonly KEEP_ALIVE_TIMEOUT_MS = 60000;
  private static readonly MAX_CACHED_AGENTS = 100;

  private readonly logger = new Logger(ProxyService.name);
  private readonly proxyEnabled: boolean;
  private readonly ipCount: number;
  private readonly host: string;
  private readonly port: string;
  private readonly username: string;
  private readonly password: string;

  private readonly proxyAgentCache: LRUCache<number, undici.ProxyAgent>;

  constructor(
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
  ) {
    this.host = this.configService.get<string>('WEBSHARE_HOST', 'p.webshare.io');
    this.port = this.configService.get<string>('WEBSHARE_PORT', '80');
    this.username = this.configService.get<string>('WEBSHARE_USERNAME', '');
    this.password = this.configService.get<string>('WEBSHARE_PASSWORD', '');
    this.ipCount = this.configService.get<number>('WEBSHARE_IP_COUNT', 100);

    this.proxyEnabled = !!(this.username && this.password);

    this.proxyAgentCache = new LRUCache<number, undici.ProxyAgent>({
      max: ProxyService.MAX_CACHED_AGENTS,
      dispose: async (agent) => {
        try {
          await agent.close();
        } catch (error) {
          this.logger.debug(`Error closing disposed proxy agent: ${error}`);
        }
      },
    });

    if (!this.proxyEnabled) {
      this.logger.warn(
        'Proxy credentials not configured (WEBSHARE_USERNAME/WEBSHARE_PASSWORD) - requests will use direct connection',
      );
      return;
    }

    this.logger.log(
      `Proxy rotation enabled: ${this.host}:${this.port} with ${this.ipCount} IPs (user: ${this.username})`,
    );
  }

  isEnabled(): boolean {
    return this.proxyEnabled;
  }

  private buildProxyUrl(proxyNumber: number): string {
    const rotatingUsername = `${this.username}-${proxyNumber}`;
    return `http://${rotatingUsername}:${this.password}@${this.host}:${this.port}`;
  }

  private getOrCreateProxyAgent(proxyNumber: number): undici.ProxyAgent {
    let agent = this.proxyAgentCache.get(proxyNumber);

    if (!agent) {
      const proxyUrl = this.buildProxyUrl(proxyNumber);
      agent = new undici.ProxyAgent({
        uri: proxyUrl,
        connections: ProxyService.DEFAULT_POOL_CONNECTIONS,
        keepAliveTimeout: ProxyService.KEEP_ALIVE_TIMEOUT_MS,
      });
      this.proxyAgentCache.set(proxyNumber, agent);
      this.logger.debug(`Created ProxyAgent for proxy ${proxyNumber}`);
    }

    return agent;
  }

  async getRotatingProxyAgent(scraperType: string): Promise<undici.ProxyAgent | undefined> {
    if (!this.proxyEnabled) {
      return undefined;
    }

    const proxyNumber = await this.cacheService.getNextProxyNumber(scraperType, this.ipCount);
    return this.getOrCreateProxyAgent(proxyNumber);
  }

  /**
   * Get a proxy agent for a specific proxy number.
   * Use this when the proxy number has already been determined
   * (e.g., after rate limit check with that proxy number).
   */
  getProxyAgentForNumber(proxyNumber: number): undici.ProxyAgent | undefined {
    if (!this.proxyEnabled) {
      return undefined;
    }

    return this.getOrCreateProxyAgent(proxyNumber);
  }

  getIpCount(): number {
    return this.ipCount;
  }

  async onModuleDestroy() {
    const agents = [...this.proxyAgentCache.values()];
    this.proxyAgentCache.clear();

    for (const agent of agents) {
      try {
        await agent.close();
      } catch (error) {
        this.logger.debug(`Error closing proxy agent: ${error}`);
      }
    }

    this.logger.log(`Closed ${agents.length} proxy agent connections`);
  }
}
