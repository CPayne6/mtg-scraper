import { Module } from '@nestjs/common';
import { CardController } from './card.controller';
import { CardService } from './card.service';
import { CacheModule } from '../cache/cache.module';
import { QueueModule } from '../queue/queue.module';
import { StoreModule } from '../store/store.module';

@Module({
  imports: [CacheModule, QueueModule, StoreModule],
  controllers: [CardController],
  providers: [CardService],
})
export class CardModule {}
