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
  CardPriceHistory,
  UnmatchedCard,
} from './database/index';
export type { ExtractionStatus } from './database/index';

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
} from './platform/index';
export type {
  ICardDetailExtractor,
  TitleInfo,
  SkuInfo,
  TagsInfo,
  ImageInfo,
} from './platform/index';
export type {
  IDiscoveryAdapter,
  IExtractionAdapter,
  DiscoveredProduct,
  ExtractedCardVariant,
  SitemapEntry,
  GetProxyAgentFn,
} from './platform/index';

// Logger
export type { NestLogLevel } from './logger/index';
export { parseLogLevel } from './logger/index';
