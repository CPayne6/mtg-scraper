import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { CacheModule } from '../cache/cache.module';
import { ProxyModule } from '../proxy/proxy.module';
import { RateLimiterModule } from '../rate-limiter/rate-limiter.module';
import { WebBotAuthModule } from '../web-bot-auth/web-bot-auth.module';
import { StoreModule } from '../store/store.module';
import { F2fCardDetailExtractor } from './adapters/shopify/extractors/f2f/f2f-card-detail.extractor';
import { BinderposCardDetailExtractor } from './adapters/shopify/extractors/binderpos/binderpos-card-detail.extractor';
import { DefaultCardDetailExtractor } from './adapters/shopify/extractors/default/default-card-detail.extractor';
import { _401CardDetailExtractor } from './adapters/shopify/extractors/_401/_401-card-detail.extractor';
import { CgRealmCardDetailExtractor } from './adapters/shopify/extractors/cgrealm/cgrealm-card-detail.extractor';
import { HobbiesvilleCardDetailExtractor } from './adapters/shopify/extractors/hobbiesville/hobbiesville-card-detail.extractor';
import { CardDetailExtractorRegistry } from './adapters/shopify/card-detail-extractor.registry';
import { StorefrontClient } from './adapters/shopify-storefront/storefront-client';
import { StorefrontExtractionAdapter } from './adapters/shopify-storefront/storefront-extraction.adapter';
import { PlatformAdapterFactory } from './platform-adapter.factory';

/**
 * Token for injecting the proxy agent factory function
 */
export const PLATFORM_PROXY_FACTORY = 'PLATFORM_PROXY_FACTORY';

@Module({
  imports: [DiscoveryModule, CacheModule, ProxyModule, RateLimiterModule, WebBotAuthModule, StoreModule],
  providers: [
    // Card detail extractors — discovered automatically via @CardDetailExtractor decorator.
    // Adding a new extractor requires only the new file + including it in this list.
    F2fCardDetailExtractor,
    BinderposCardDetailExtractor,
    DefaultCardDetailExtractor,
    _401CardDetailExtractor,
    CgRealmCardDetailExtractor,
    HobbiesvilleCardDetailExtractor,
    CardDetailExtractorRegistry,
    StorefrontClient,
    StorefrontExtractionAdapter,
    PlatformAdapterFactory,
  ],
  exports: [
    StorefrontExtractionAdapter,
    PlatformAdapterFactory,
    CardDetailExtractorRegistry,
    DefaultCardDetailExtractor,
  ],
})
export class PlatformModule {}
