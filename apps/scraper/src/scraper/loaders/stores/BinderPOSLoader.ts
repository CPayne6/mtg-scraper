import * as undici from 'undici';
import { ProxyService } from '@/scraper/proxy/proxy.service';
import { APILoader, searchReplace } from '../APILoader';

export class BinderPOSLoader extends APILoader {
  static create(
    storeURL: string,
    page: string,
    proxyService: ProxyService,
  ): BinderPOSLoader {
    return new BinderPOSLoader(storeURL, page, proxyService.getProxyAgent());
  }

  constructor(storeURL: string, page: string, proxyAgent?: undici.ProxyAgent) {
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
          ['storeUrl', /Shopify.shop = "(.+)";/],
          ['title', searchReplace],
        ],
        method: 'POST',
      },
      proxyAgent,
    });
  }
}
