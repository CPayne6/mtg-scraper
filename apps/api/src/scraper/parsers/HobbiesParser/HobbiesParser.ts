import { Card, Condition } from "@mtg-scraper/shared";
import { Parser } from "../Parser";
import { HobbiesSearch } from "./search.types";

const nameRegex = /^([^\(]+) \(/i

interface HobbiesParserConfig {
  store_id_regex: RegExp;
  path: string;
  host: string;
  params: URLSearchParams;
}

const defaultConfig: HobbiesParserConfig = {
  store_id_regex: /storePassId\(\) \{ return '(\w+)' \}/,
  host: 'https://stable.storepass.co',
  path: '/saas/search',
  params: new URLSearchParams('mongo=true&override_buylist_gt_price=true&product_line=All&sort=Relevance&limit=30&fields=id%2CproductId%2Cavailability%2Cstock%2CselectedFinish%2Curl%2CimageUrl%2Cprice%2CsalePrice%2CregularPrice%2Cname%2CvariantInfo%2CbigCommerceImages%2Cmsrp%2Ctags%2Cpublisher%2CinventoryLevels%2CcustomCollectionImages&convert_to_currency=CAD&round_price=true&in_stock=true')
}

export class HobbiesParser implements Parser {
  protected searchConfig: HobbiesParserConfig
  constructor(config?: Partial<HobbiesParserConfig>) {
    this.searchConfig = {
      ...defaultConfig,
      ...config
    }
  }
  async extractItems(page: string) {
    const cards: Card[] = []
    let parsedData: HobbiesSearch;

    try {
      parsedData = JSON.parse(page)
    }catch(err){
      console.error(err)
      return {
        result: [],
        error: err?.toString() as string
      }
    }
    
    for(const product of parsedData?.products){
      const variantInfo = product.variantInfo ?? product.variant_info

      if(!variantInfo){
        continue;
      }

      const innerCards: Card[] = []
      for(const variant of variantInfo){
        if(variant.inventory_quantity > 0){
          const splitDisplayName = product.display_name.split('-')
          innerCards.push({
            price: variant.price,
            currency: 'CAD',
            image: product.imageUrl ?? product.image_url,
            condition: variant.title.toLocaleLowerCase() as Condition,
            title: product.display_name.match(nameRegex)?.[1] ?? product.display_name,
            link: product.url,
            set: splitDisplayName[0]?.substring(splitDisplayName[0].lastIndexOf('(') + 1, splitDisplayName[0].length) ?? 'Unknown',
            card_number: String(Number(splitDisplayName[1]?.substring(0, splitDisplayName[1].indexOf(')'))))
          })
        }
      }

      cards.push(...innerCards)
    }
    return { result: cards }
  }

}
