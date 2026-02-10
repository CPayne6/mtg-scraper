import { APILoader, searchReplace } from '../APILoader';
import { GetProxyAgentFn } from '../HTTPLoader';

export class F2FLoader extends APILoader {
  static create(getProxyAgent?: GetProxyAgentFn): F2FLoader {
    return new F2FLoader(getProxyAgent);
  }

  constructor(getProxyAgent?: GetProxyAgentFn) {
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
      getProxyAgent,
    });
  }
}
