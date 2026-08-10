import { Module } from '@nestjs/common';
import { CacheModule, QueueModule } from '@scoutlgs/core';
import { ScryfallCatalogScheduler } from './scryfall-catalog.scheduler';
import { ScryfallCatalogService } from './scryfall-catalog.service';

@Module({
  imports: [CacheModule, QueueModule],
  providers: [ScryfallCatalogService, ScryfallCatalogScheduler],
})
export class ScryfallCatalogModule {}
