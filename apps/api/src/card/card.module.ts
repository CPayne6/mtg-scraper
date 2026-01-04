import { Module } from '@nestjs/common';
import { CardController } from './card.controller';
import { CardService } from './card.service';
import { CacheModule, QueueModule, StoreModule } from '@mtg-scraper/core';

@Module({
  imports: [CacheModule, QueueModule, StoreModule],
  controllers: [CardController],
  providers: [CardService],
})
export class CardModule {}
