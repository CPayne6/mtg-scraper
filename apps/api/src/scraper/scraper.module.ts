import { Module } from '@nestjs/common';
import { ProxyService } from './proxy/proxy.service';
import { ScraperService } from './scraper.service';

@Module({
  providers: [ProxyService, ScraperService],
  exports: [ScraperService],
})
export class ScraperModule {}
