import { APILoader, searchReplace } from '../APILoader';
import { GetProxyAgentFn } from '../HTTPLoader';

export class HobbiesLoader extends APILoader {
  static create(getProxyAgent?: GetProxyAgentFn): HobbiesLoader {
    return new HobbiesLoader(getProxyAgent);
  }

  constructor(getProxyAgent?: GetProxyAgentFn) {
    super({
      initial: {
        baseUrl: 'https://hobbiesville.com',
        params: 'product_line=All&sort=Relevance&limit=30&tags=Type_Single',
        path: '/search',
        searchKey: 'q',
      },
      api: {
        baseUrl: 'https://stable.storepass.co',
        path: ['saas', 'search'],
        params: [
          ['store_id', /storePassId\(\) \{ return '(\w+)' \}/],
          ['override_buylist_gt_price', 'true'],
          ['product_line', 'All'],
          ['sort', 'Relevance'],
          ['limit', '30'],
          [
            'fields',
            'id,productId,availability,stock,selectedFinish,url,imageUrl,price,salePrice,regularPrice,name,variantInfo,bigCommerceImages,msrp,tags,publisher,inventoryLevels,customCollectionImages',
          ],
          ['convert_to_currency', 'CAD'],
          ['round_price', 'true'],
          ['in_stock', 'true'],
          ['name', searchReplace],
          ['q', searchReplace],
        ],
      },
      getProxyAgent,
    });
  }
}
