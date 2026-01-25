import * as undici from 'undici';
import { ProxyService } from '@/scraper/proxy/proxy.service';
import { APILoader, searchReplace } from '../APILoader';

export class HobbiesLoader extends APILoader {
  static create(proxyService: ProxyService): HobbiesLoader {
    return new HobbiesLoader(proxyService.getProxyAgent());
  }

  constructor(proxyAgent?: undici.ProxyAgent) {
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
      proxyAgent,
    });
  }
}
