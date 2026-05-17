import { Module } from '@nestjs/common';
import {
  LoaderService,
  ProxyAgentFactory,
  PROXY_AGENT_FACTORY,
} from './loader.service';
import { ScraperService } from './scraper.service';
import { ScrapeCardProcessor } from './scraper.processor';
import { StoreModule, CacheModule, QueueModule, ProxyModule, ProxyService } from '@scoutlgs/core';

@Module({
  imports: [StoreModule, CacheModule, QueueModule, ProxyModule],
  providers: [
    {
      provide: PROXY_AGENT_FACTORY,
      useFactory: (proxyService: ProxyService): ProxyAgentFactory => {
        return (scraperType: string) => () =>
          proxyService.getRotatingProxyAgent(scraperType);
      },
      inject: [ProxyService],
    },
    LoaderService,
    ScraperService,
    ScrapeCardProcessor,
  ],
  exports: [ScraperService],
})
export class ScraperModule {}
