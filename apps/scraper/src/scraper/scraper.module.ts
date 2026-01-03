import { Module } from '@nestjs/common';
import { ProxyService } from './proxy/proxy.service';
import { ScraperService } from './scraper.service';
import { StoreModule } from '../store/store.module';

@Module({
  imports: [StoreModule],
  providers: [ProxyService, ScraperService],
  exports: [ScraperService],
})
export class ScraperModule {}
