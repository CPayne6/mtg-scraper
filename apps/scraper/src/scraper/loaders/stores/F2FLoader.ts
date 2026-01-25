import * as undici from 'undici';
import { ProxyService } from '@/scraper/proxy/proxy.service';
import { APILoader, searchReplace } from '../APILoader';

export class F2FLoader extends APILoader {
  static create(proxyService: ProxyService): F2FLoader {
    return new F2FLoader(proxyService.getProxyAgent());
  }

  constructor(proxyAgent?: undici.ProxyAgent) {
    super({
      initial: {
        baseUrl: 'https://facetofacegames.com',
        path: '/search',
        params: 'filter__Availability=In+Stock&sort_by=price_asc',
        searchKey: 'q',
      },
      api: {
        baseUrl: 'https://facetofacegames.com',
        path: [
          'apps',
          'prod-indexer',
          'search',
          'pageSize',
          '24',
          'page',
          '1',
          'keyword',
          searchReplace,
          'sort',
          'price_asc',
          'Availability',
          'In%2520Stock',
        ],
      },
      proxyAgent,
    });
  }
}
