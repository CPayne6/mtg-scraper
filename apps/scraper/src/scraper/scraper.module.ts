import { Module } from '@nestjs/common';
import { ProxyService } from './proxy/proxy.service';
import { ScraperService } from './scraper.service';
import { ScrapeCardProcessor } from './scraper.processor';
import { StoreModule, CacheModule, QueueModule } from '@mtg-scraper/core';

@Module({
  imports: [StoreModule, CacheModule, QueueModule],
  providers: [ProxyService, ScraperService, ScrapeCardProcessor],
  exports: [ScraperService],
})
export class ScraperModule {}
