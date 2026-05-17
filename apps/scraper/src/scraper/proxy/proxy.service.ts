import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as undici from 'undici';
import { CacheService } from '@scoutlgs/core';
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

  // LRU cache for proxy agents - keeps max 100 agents to manage memory
  private readonly proxyAgentCache: LRUCache<number, undici.ProxyAgent>;

  constructor(
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
  ) {
    // Load proxy configuration from env vars
    this.host = this.configService.get<string>('WEBSHARE_HOST', 'p.webshare.io');
    this.port = this.configService.get<string>('WEBSHARE_PORT', '80');
    this.username = this.configService.get<string>('WEBSHARE_USERNAME', '');
    this.password = this.configService.get<string>('WEBSHARE_PASSWORD', '');
    this.ipCount = this.configService.get<number>('WEBSHARE_IP_COUNT', 1000);

    // Only enable proxy if credentials are provided
    this.proxyEnabled = !!(this.username && this.password);

    // Initialize LRU cache for proxy agents
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

  /**
   * Check if proxy is enabled and configured.
   */
  isEnabled(): boolean {
    return this.proxyEnabled;
  }

  /**
   * Build proxy URL for a specific proxy number.
   * Format: http://{username}-{n}:{password}@{host}:{port}
   */
  private buildProxyUrl(proxyNumber: number): string {
    // Append -N to username to connect to specific proxy IP
    const rotatingUsername = `${this.username}-${proxyNumber}`;
    return `http://${rotatingUsername}:${this.password}@${this.host}:${this.port}`;
  }

  /**
   * Get or create a ProxyAgent for a specific proxy number.
   * Uses LRU cache to manage memory (max 100 agents).
   */
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

  /**
   * Get a rotating proxy agent for a specific scraper type.
   * Each scraper type maintains its own counter in Redis.
   * Returns undefined if proxy is not enabled.
   */
  async getRotatingProxyAgent(scraperType: string): Promise<undici.ProxyAgent | undefined> {
    if (!this.proxyEnabled) {
      return undefined;
    }

    // Get next proxy number from Redis (atomic increment with wrap-around)
    const proxyNumber = await this.cacheService.getNextProxyNumber(scraperType, this.ipCount);

    // Get or create ProxyAgent for this proxy number
    return this.getOrCreateProxyAgent(proxyNumber);
  }

  /**
   * Get the current IP count configuration.
   */
  getIpCount(): number {
    return this.ipCount;
  }

  async onModuleDestroy() {
    // Close all cached proxy agents
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
