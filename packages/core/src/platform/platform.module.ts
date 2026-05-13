import { Module } from '@nestjs/common';
import { CacheModule } from '../cache/cache.module';
import { ProxyModule } from '../proxy/proxy.module';
import { RateLimiterModule } from '../rate-limiter/rate-limiter.module';
import { WebBotAuthModule } from '../web-bot-auth/web-bot-auth.module';
import { ShopifyDiscoveryAdapter } from './adapters/shopify/shopify-discovery.adapter';
import { ShopifyExtractionAdapter } from './adapters/shopify/shopify-extraction.adapter';
import { F2fCardDetailExtractor } from './adapters/shopify/extractors/f2f-card-detail.extractor';
import { BinderposCardDetailExtractor } from './adapters/shopify/extractors/binderpos-card-detail.extractor';
import { DefaultCardDetailExtractor } from './adapters/shopify/extractors/default-card-detail.extractor';
import { Four01CardDetailExtractor } from './adapters/shopify/extractors/four01-card-detail.extractor';
import { StorefrontClient } from './adapters/shopify-storefront/storefront-client';
import { StorefrontExtractionAdapter } from './adapters/shopify-storefront/storefront-extraction.adapter';
import { PlatformAdapterFactory } from './platform-adapter.factory';

/**
 * Token for injecting the proxy agent factory function
 */
export const PLATFORM_PROXY_FACTORY = 'PLATFORM_PROXY_FACTORY';

@Module({
  imports: [CacheModule, ProxyModule, RateLimiterModule, WebBotAuthModule],
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
    StorefrontClient,
    StorefrontExtractionAdapter,
    PlatformAdapterFactory,
  ],
  exports: [
    ShopifyDiscoveryAdapter,
    ShopifyExtractionAdapter,
    StorefrontExtractionAdapter,
    PlatformAdapterFactory,
    F2fCardDetailExtractor,
    BinderposCardDetailExtractor,
    DefaultCardDetailExtractor,
    Four01CardDetailExtractor,
  ],
})
export class PlatformModule {}
