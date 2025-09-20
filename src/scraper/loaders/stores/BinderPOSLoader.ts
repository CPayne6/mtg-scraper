import { APILoader, searchReplace } from "../APILoader";


export class BinderPOSLoader extends APILoader {
  constructor(storeURL: string) {
    super({
      initial: {
        baseUrl: storeURL,
        path: '/pages/mtg-advanced-search',
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
      }
    })
  }
}

