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
export {
  StorefrontClient,
  StorefrontExtractionAdapter,
  DEFAULT_STOREFRONT_API_VERSION,
  STOREFRONT_API_VERSION,
  getStorefrontApiVersion,
  COLLECTION_PRODUCTS_QUERY,
  PRODUCT_BY_HANDLE_QUERY,
  PRODUCTS_QUERY,
} from './adapters/shopify-storefront';
export type {
  StorefrontGraphQLResponse,
  StorefrontGraphQLError,
  StorefrontProduct,
  StorefrontVariant,
  CollectionProductsData,
  ProductByHandleData,
  ProductsQueryData,
  PageInfo,
} from './adapters/shopify-storefront';
export type {
  IDiscoveryAdapter,
  IExtractionAdapter,
  DiscoveredProduct,
  ExtractedCardVariant,
  SitemapEntry,
  GetProxyAgentFn,
} from './platform.interfaces';
