import { Module } from '@nestjs/common';
import { ProxyModule } from '../proxy/proxy.module';
import { ShopifyDiscoveryAdapter } from './adapters/shopify/shopify-discovery.adapter';
import { ShopifyExtractionAdapter } from './adapters/shopify/shopify-extraction.adapter';
import { F2fCardDetailExtractor } from './adapters/shopify/extractors/f2f-card-detail.extractor';
import { BinderposCardDetailExtractor } from './adapters/shopify/extractors/binderpos-card-detail.extractor';
import { DefaultCardDetailExtractor } from './adapters/shopify/extractors/default-card-detail.extractor';
import { Four01CardDetailExtractor } from './adapters/shopify/extractors/four01-card-detail.extractor';
import { PlatformAdapterFactory } from './platform-adapter.factory';

/**
 * Token for injecting the proxy agent factory function
 */
export const PLATFORM_PROXY_FACTORY = 'PLATFORM_PROXY_FACTORY';

@Module({
  imports: [ProxyModule],
  providers: [
    F2fCardDetailExtractor,
    BinderposCardDetailExtractor,
    DefaultCardDetailExtractor,
    Four01CardDetailExtractor,
    {
      provide: 'CARD_DETAIL_EXTRACTORS',
      useFactory: (
        f2f: F2fCardDetailExtractor,
        binderpos: BinderposCardDetailExtractor,
        four01: Four01CardDetailExtractor,
      ) => ({
        f2f,
        binderpos,
        '401': four01,
      }),
      inject: [F2fCardDetailExtractor, BinderposCardDetailExtractor, Four01CardDetailExtractor],
    },
    ShopifyDiscoveryAdapter,
    ShopifyExtractionAdapter,
    PlatformAdapterFactory,
  ],
  exports: [
    ShopifyDiscoveryAdapter,
    ShopifyExtractionAdapter,
    PlatformAdapterFactory,
    F2fCardDetailExtractor,
    BinderposCardDetailExtractor,
    DefaultCardDetailExtractor,
    Four01CardDetailExtractor,
  ],
})
export class PlatformModule {}
