import { APILoader, searchReplace } from "../APILoader";
import { Proxy } from "@/scraper/proxy";

export class _401Loader extends APILoader {
  constructor(proxy?: Proxy) {
    super({
      initial: {
        baseUrl: 'https://store.401games.ca',
        path: '/pages/search-results',
        params: 'filters=In+Stock,True',
        searchKey: 'q'
      },
      api: {
        baseUrl: /FAST_ENDPOINT = "(https:\/\/.+)"/,
        path: ['search', 'full_text_search'],
        params: [
          ['store_id', /STORE_ID = Number\("(\d+)"\);/],
          ['uuid', /STORE_UUID = "(.*)";/],
          ['sort_by', 'relevency'],
          ['with_product_attributes', 'true'],
          ['narrow', '[["In Stock","True"]]'],
          ['products_per_page', '40'],
          ['q', searchReplace]
        ]
      },
      proxy
    })
  }
}
