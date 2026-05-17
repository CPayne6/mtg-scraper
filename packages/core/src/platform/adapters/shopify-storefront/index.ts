export { StorefrontClient } from './storefront-client';
export { StorefrontExtractionAdapter } from './storefront-extraction.adapter';
export type {
  StorefrontGraphQLResponse,
  StorefrontGraphQLError,
  StorefrontProduct,
  StorefrontVariant,
  CollectionProductsData,
  ProductByHandleData,
  PageInfo,
} from './storefront.types';
export {
  DEFAULT_STOREFRONT_API_VERSION,
  STOREFRONT_API_VERSION,
  getStorefrontApiVersion,
  COLLECTION_PRODUCTS_QUERY,
  PRODUCT_BY_HANDLE_QUERY,
} from './storefront.queries';
