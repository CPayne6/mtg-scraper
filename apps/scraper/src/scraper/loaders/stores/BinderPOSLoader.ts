import { APILoader, searchReplace } from '../APILoader';
import { GetProxyAgentFn } from '../HTTPLoader';

export class BinderPOSLoader extends APILoader {
  static create(
    storeURL: string,
    page: string,
    getProxyAgent?: GetProxyAgentFn,
    shopifyUrl?: string,
  ): BinderPOSLoader {
    return new BinderPOSLoader(storeURL, page, getProxyAgent, shopifyUrl);
  }

  constructor(
    storeURL: string,
    page: string,
    getProxyAgent?: GetProxyAgentFn,
    shopifyUrl?: string,
  ) {
    super({
      initial: {
        baseUrl: storeURL,
        path: '/pages/' + page,
        params: 'availabilty=true',
        searchKey: 'q',
      },
      api: {
        baseUrl:
          'https://portal.binderpos.com/external/shopify/products/forStore',
        path: [],
        body: [
          ['game', 'mtg'],
          ['instockOnly', true],
          ['limit', 30],
          ['offset', 0],
          ['priceGreaterThan', 0],
          ['priceLessThan', null],
          [
            'sortTypes',
            [
              {
                asc: true,
                order: 1,
                type: 'price',
              },
            ],
          ],
          // Use provided shopifyUrl if available, otherwise extract from page
          ['storeUrl', shopifyUrl ?? /Shopify.shop = "(.+)";/],
          ['title', searchReplace],
        ],
        method: 'POST',
      },
      getProxyAgent,
    });

    // If shopifyUrl is provided, pre-populate the cache to skip initial page fetch
    if (shopifyUrl) {
      this.cacheApiPage(`Shopify.shop = "${shopifyUrl}";`);
    }
  }
}
