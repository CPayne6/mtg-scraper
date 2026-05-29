export { PlatformModule, PLATFORM_PROXY_FACTORY } from './platform.module';
export { PlatformAdapterFactory } from './platform-adapter.factory';
export * from './adapters/shopify';
export * from './adapters/shopify-storefront';
export type {
  IExtractionAdapter,
  ExtractedCardVariant,
} from './platform.interfaces';
