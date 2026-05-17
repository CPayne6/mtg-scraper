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
 * Root products query with full variant details, sorted by ID.
 * Used for ID-based pagination via products(query: "scope id:>lastId").
 * Variables: $query (filter string including id:>X), $first
 */
export const PRODUCTS_QUERY = `
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
 * Lightweight query returning only the product ID, sorted by ID.
 * Used to bootstrap min/max ID discovery for range-split extraction.
 * The `reverse: true` variant is requested via a separate query string.
 */
export const PRODUCT_ID_ASC_QUERY = `
  query ProductIdAsc($query: String!) {
    products(first: 1, query: $query, sortKey: ID) {
      edges {
        node {
          id
        }
      }
    }
  }
`;

export const PRODUCT_ID_DESC_QUERY = `
  query ProductIdDesc($query: String!) {
    products(first: 1, query: $query, sortKey: ID, reverse: true) {
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
