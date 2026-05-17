import { Module } from '@nestjs/common';
import { CacheModule } from '../cache/cache.module';
import { ProxyService } from './proxy.service';

@Module({
  imports: [CacheModule],
  providers: [ProxyService],
  exports: [ProxyService],
})
export class ProxyModule {}
