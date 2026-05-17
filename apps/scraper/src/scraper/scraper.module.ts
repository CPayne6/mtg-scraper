import { Module } from '@nestjs/common';
import { ProxyService } from './proxy/proxy.service';
import {
  LoaderService,
  ProxyAgentFactory,
  PROXY_AGENT_FACTORY,
} from './loader.service';
import { ScraperService } from './scraper.service';
import { ScrapeCardProcessor } from './scraper.processor';
import { StoreModule, CacheModule, QueueModule } from '@scoutlgs/core';

@Module({
  imports: [StoreModule, CacheModule, QueueModule],
  providers: [
    ProxyService,
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
