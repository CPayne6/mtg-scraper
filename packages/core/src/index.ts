// Database
export {
  getDatabaseConfig,
  Store,
  Platform,
  MtgSinglesCollection,
  CardName,
  ProductUrl,
  ScryfallSet,
  CardPrinting,
  CardListing,
  Card,
  CardCondition,
  CardVariant,
  UnmatchedCard,
  InvalidProductHandle,
  TokenName,
  TokenPrinting,
  TokenListing,
  TokenVariant,
  DiscoveryRun,
  CardList,
  CardListEntry,
} from './database/index';
export type { ExtractionStatus, DiscoveryRunStatus, DiscoveryRunTrigger } from './database/index';

// Queue
export { QueueModule, QueueService } from './queue/index';

// Store
export { StoreModule, StoreService } from './store/index';

// Cache
export { CacheModule, CacheService } from './cache/index';
export type { CardWithStore, BackoffCheckResult, StoreBackoffState } from './cache/index';

// Proxy
export { ProxyModule, ProxyService } from './proxy/index';

// Platform
export {
  PlatformModule,
  PLATFORM_PROXY_FACTORY,
  PlatformAdapterFactory,
  ShopifyDiscoveryAdapter,
  ShopifyExtractionAdapter,
  ExtractionHttpError,
  F2fCardDetailExtractor,
  BinderposCardDetailExtractor,
  DefaultCardDetailExtractor,
  Four01CardDetailExtractor,
  StorefrontClient,
  StorefrontExtractionAdapter,
  DEFAULT_STOREFRONT_API_VERSION,
  STOREFRONT_API_VERSION,
  getStorefrontApiVersion,
  COLLECTION_PRODUCTS_QUERY,
  PRODUCT_BY_HANDLE_QUERY,
} from './platform/index';
export type {
  ICardDetailExtractor,
  TitleInfo,
  SkuInfo,
  TagsInfo,
  ImageInfo,
} from './platform/index';
export type {
  StorefrontGraphQLResponse,
  StorefrontGraphQLError,
  StorefrontProduct,
  StorefrontVariant,
  CollectionProductsData,
  ProductByHandleData,
  PageInfo,
} from './platform/index';
export type {
  IDiscoveryAdapter,
  IExtractionAdapter,
  DiscoveredProduct,
  ExtractedCardVariant,
  SitemapEntry,
  GetProxyAgentFn,
} from './platform/index';

// Rate Limiter
export { RateLimiterModule, RateLimiterService } from './rate-limiter/index';
export type { RateLimitResult } from './rate-limiter/index';

// Logger
export type { NestLogLevel } from './logger/index';
export { parseLogLevel } from './logger/index';

// Web Bot Auth
export { WebBotAuthModule, WebBotAuthService } from './web-bot-auth/index';
