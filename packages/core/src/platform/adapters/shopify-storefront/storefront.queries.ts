export const DEFAULT_STOREFRONT_API_VERSION = '2026-04';
export const STOREFRONT_API_VERSION = DEFAULT_STOREFRONT_API_VERSION;

export function getStorefrontApiVersion(): string {
  return (
    process.env.SHOPIFY_STOREFRONT_API_VERSION?.trim() ||
    DEFAULT_STOREFRONT_API_VERSION
  );
}

export const COLLECTION_PRODUCTS_QUERY = `
  query CollectionProducts($handle: String!, $first: Int!, $after: String) {
    collection(handle: $handle) {
      products(first: $first, after: $after) {
        edges {
          node {
            handle
            title
            vendor
            productType
            descriptionHtml
            availableForSale
            updatedAt
            tags
            onlineStoreUrl
            images(first: 10) {
              edges {
                node {
                  url
                  altText
                }
              }
            }
            variants(first: 100) {
              edges {
                node {
                  id
                  title
                  sku
                  availableForSale
                  price {
                    amount
                    currencyCode
                  }
                  selectedOptions {
                    name
                    value
                  }
                }
              }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;

/**
 * Search for products by vendor (set name) with full variant details.
 * Used to iterate products set-by-set to avoid the 25K pagination limit.
 * Variables: $query (search string e.g. 'vendor:"Set Name"'), $first, $after
 */
export const SEARCH_PRODUCTS_QUERY = `
  query SearchProducts($query: String!, $first: Int!, $after: String) {
    search(query: $query, types: PRODUCT, first: $first, after: $after) {
      totalCount
      edges {
        node {
          ... on Product {
            handle
            title
            vendor
            productType
            descriptionHtml
            availableForSale
            updatedAt
            tags
            onlineStoreUrl
            images(first: 10) {
              edges {
                node {
                  url
                  altText
                }
              }
            }
            variants(first: 100) {
              edges {
                node {
                  id
                  title
                  sku
                  availableForSale
                  price {
                    amount
                    currencyCode
                  }
                  selectedOptions {
                    name
                    value
                  }
                }
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

/**
 * Root products query with full variant details for exact product lookups.
 *
 * Variables: $query (for example `id:X OR id:Y`), $first.
 */
export const PRODUCTS_BY_QUERY = `
  query ProductsByQuery($query: String!, $first: Int!) {
    products(first: $first, query: $query, sortKey: ID) {
      edges {
        node {
          id
          handle
          title
          vendor
          productType
          descriptionHtml
          availableForSale
          updatedAt
          tags
          onlineStoreUrl
          images(first: 10) {
            edges {
              node {
                url
                altText
              }
            }
          }
          variants(first: 100) {
            edges {
              node {
                id
                title
                sku
                availableForSale
                price {
                  amount
                  currencyCode
                }
                selectedOptions {
                  name
                  value
                }
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

/**
 * Cursor-paginated products query for the date-bucket strategy.
 *
 * `sortKey: CREATED_AT` matches the bucketing dimension, so cursor pagination
 * stays consistent across pages within the bucket. `after: $after` is the
 * opaque cursor returned by Shopify in `pageInfo.endCursor` — server-side
 * stateful, exhaustive within the snapshot (unlike the legacy `id:>X` filter
 * which is partially-ignored undocumented behaviour).
 *
 * Hitting Shopify's 25K cursor depth returns a GraphQL error
 * "Platform limit for pagination (25000 items) exceeded by 250 items." —
 * the adapter translates that into `StorefrontPaginationLimitError` and the
 * processor splits the bucket's date range in two.
 *
 * Variables: $query (scope + created_at:>='X' created_at:<'Y'), $first, $after.
 */
export const PRODUCTS_BY_CREATED_AT_QUERY = `
  query ProductsByCreatedAt($query: String!, $first: Int!, $after: String) {
    products(first: $first, query: $query, sortKey: CREATED_AT, after: $after) {
      edges {
        node {
          id
          handle
          title
          vendor
          productType
          descriptionHtml
          availableForSale
          updatedAt
          tags
          onlineStoreUrl
          images(first: 10) {
            edges {
              node {
                url
                altText
              }
            }
          }
          variants(first: 100) {
            edges {
              node {
                id
                title
                sku
                availableForSale
                price {
                  amount
                  currencyCode
                }
                selectedOptions {
                  name
                  value
                }
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

/**
 * Lightweight query returning the oldest matching product's `createdAt`.
 * Used to find the lower bound for date-range bucketing — answers
 * "when does this store's catalog start?" without paginating.
 */
export const PRODUCT_CREATED_AT_ASC_QUERY = `
  query ProductCreatedAtAsc($query: String!) {
    products(first: 1, query: $query, sortKey: CREATED_AT) {
      edges {
        node {
          createdAt
        }
      }
    }
  }
`;

/**
 * Lightweight query returning the newest matching product's `createdAt`.
 * Used to find the upper bound for date-range bucketing.
 */
export const PRODUCT_CREATED_AT_DESC_QUERY = `
  query ProductCreatedAtDesc($query: String!) {
    products(first: 1, query: $query, sortKey: CREATED_AT, reverse: true) {
      edges {
        node {
          createdAt
        }
      }
    }
  }
`;

/**
 * Cheap "does this bucket have anything?" probe. Used by date-range bucket
 * jobs to skip empty windows without doing a full first:250 fetch.
 */
export const PRODUCT_BUCKET_PROBE_QUERY = `
  query ProductBucketProbe($query: String!) {
    products(first: 1, query: $query, sortKey: CREATED_AT) {
      edges {
        node {
          id
        }
      }
    }
  }
`;

export const PRODUCT_BY_HANDLE_QUERY = `
  query ProductByHandle($handle: String!) {
    product(handle: $handle) {
      id
      handle
      title
      vendor
      productType
      descriptionHtml
      availableForSale
      updatedAt
      tags
      onlineStoreUrl
      images(first: 10) {
        edges {
          node {
            url
            altText
          }
        }
      }
      variants(first: 100) {
        edges {
          node {
            id
            title
            sku
            availableForSale
            price {
              amount
              currencyCode
            }
            selectedOptions {
              name
              value
            }
          }
        }
      }
    }
  }
`;
