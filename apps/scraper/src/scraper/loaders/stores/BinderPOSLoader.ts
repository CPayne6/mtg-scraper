import { Proxy } from "@/scraper/proxy";
import { APILoader, searchReplace } from "../APILoader";


export class BinderPOSLoader extends APILoader {
  constructor(storeURL: string, page: string, proxy: Proxy) {
    super({
      initial: {
        baseUrl: storeURL,
        path: '/pages/' + page,
        params: 'availabilty=true',
        searchKey: 'q'
      },
      api: {
        baseUrl: 'https://portal.binderpos.com/external/shopify/products/forStore',
        path: [],
        body: [
          ['game', 'mtg'],
          ['instockOnly', true],
          ['limit', 30],
          ['offset', 0],
          ['priceGreaterThan', 0],
          ['priceLessThan', null],
          ['sortTypes', [{
            asc: true,
            order: 1,
            type: 'price'
          }]],
          ['storeUrl', /Shopify.shop = "(.+)";/],
          ['title', searchReplace]
        ],
        method: 'POST'
      },
      proxy
    })
  }
}

