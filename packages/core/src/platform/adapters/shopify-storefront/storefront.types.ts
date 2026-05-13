/**
 * Generic GraphQL response envelope from Shopify Storefront API
 */
export interface StorefrontGraphQLResponse<T> {
  data?: T;
  errors?: StorefrontGraphQLError[];
  extensions?: {
    cost: {
      requestedQueryCost: number;
      actualQueryCost: number;
      throttleStatus: {
        maximumAvailable: number;
        currentlyAvailable: number;
        restoreRate: number;
      };
    };
  };
}

export interface StorefrontGraphQLError {
  message: string;
  locations?: Array<{ line: number; column: number }>;
  path?: string[];
  extensions?: { code: string };
}

export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string;
}

/**
 * Product from Shopify Storefront API
 */
export interface StorefrontProduct {
  id: string;              // "gid://shopify/Product/123"
  handle: string;
  title: string;
  vendor: string;
  productType: string;
  descriptionHtml: string;
  availableForSale: boolean;
  updatedAt: string;       // ISO 8601
  tags: string[];
  onlineStoreUrl: string;
  images: {
    edges: Array<{
      node: { url: string; altText?: string };
    }>;
  };
  variants: {
    edges: Array<{ node: StorefrontVariant }>;
  };
}

/**
 * Product variant from Shopify Storefront API
 */
export interface StorefrontVariant {
  id: string;              // "gid://shopify/ProductVariant/456"
  title: string;
  sku: string | null;
  availableForSale: boolean;
  price: {
    amount: string;        // e.g. "2.50" (dollars, not cents)
    currencyCode: string;  // e.g. "CAD"
  };
  selectedOptions: Array<{
    name: string;          // e.g. "Condition", "Style"
    value: string;         // e.g. "NM", "Foil"
  }>;
}

// Query response types
export interface CollectionProductsData {
  collection: {
    products: {
      edges: Array<{ node: StorefrontProduct }>;
      pageInfo: PageInfo;
    };
  } | null;
}

export interface ProductByHandleData {
  product: StorefrontProduct | null;
}
