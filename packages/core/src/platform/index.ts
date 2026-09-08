export { PlatformModule, PLATFORM_PROXY_FACTORY } from './platform.module';
export { PlatformAdapterFactory } from './platform-adapter.factory';
export {
  validatePlatformStoreConfig,
  validateCrystalCommerceConfig,
  validateConductCommerceConfig,
} from './platform-config.validation';
export * from './adapters/shopify';
export * from './adapters/shopify-storefront';
export { ConductCommerceClient, ConductCommerceApiError } from './adapters/conduct-commerce/conduct-commerce.client';
export { ConductCommerceExtractionAdapter } from './adapters/conduct-commerce/conduct-commerce-extraction.adapter';
export { ConductCardDetailExtractor } from './adapters/conduct-commerce/conduct-card-detail.extractor';
export type { ConductCategoryExtraction } from './adapters/conduct-commerce/conduct-commerce-extraction.adapter';
export type {
  ConductApiError,
  ConductApiEnvelope,
  ConductVariant,
  ConductListing,
  ConductCategory,
  ConductProductType,
  ConductSettings,
  ConductListingsResult,
  ConductDetailField,
  ConductProductDetails,
} from './adapters/conduct-commerce/conduct-commerce.types';
export type {
  IExtractionAdapter,
  ExtractedCardVariant,
} from './platform.interfaces';
