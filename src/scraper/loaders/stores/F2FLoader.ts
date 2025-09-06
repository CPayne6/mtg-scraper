import { APILoader, searchReplace } from "../APILoader";

export class F2FLoader extends APILoader {
  constructor(){
    super({
      initial: {
        baseUrl: 'https://facetofacegames.com',
        path: '/search',
        params: 'filter__Availability=In+Stock&sort_by=price_asc',
        searchKey: 'q'
      },
      api: {
        baseUrl: 'https://facetofacegames.com',
        path: [
          'apps', 'prod-indexer', 'search', 
          'pageSize', '24',
          'page', '1',
          'keyword', searchReplace,
          'sort', 'price_asc',
          'Availability', 'In%2520Stock'
        ]
      }
    })
  }
}
