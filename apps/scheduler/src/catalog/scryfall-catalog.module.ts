import { Module } from '@nestjs/common';
import { ScryfallCatalogScheduler } from './scryfall-catalog.scheduler';
import { ScryfallCatalogService } from './scryfall-catalog.service';

@Module({ providers: [ScryfallCatalogService, ScryfallCatalogScheduler] })
export class ScryfallCatalogModule {}
