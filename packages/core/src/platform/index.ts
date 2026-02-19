export { PlatformModule, PLATFORM_PROXY_FACTORY } from './platform.module';
export { PlatformAdapterFactory } from './platform-adapter.factory';
export {
  ShopifyDiscoveryAdapter,
  ShopifyExtractionAdapter,
  ExtractionHttpError,
  F2fCardDetailExtractor,
  BinderposCardDetailExtractor,
  DefaultCardDetailExtractor,
  Four01CardDetailExtractor,
} from './adapters/shopify';
export type {
  ICardDetailExtractor,
  TitleInfo,
  SkuInfo,
  TagsInfo,
  ImageInfo,
  ProductMetaInfo,
} from './adapters/shopify';
export type {
  IDiscoveryAdapter,
  IExtractionAdapter,
  DiscoveredProduct,
  ExtractedCardVariant,
  SitemapEntry,
  GetProxyAgentFn,
} from './platform.interfaces';
