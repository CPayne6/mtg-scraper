import { Parser } from "../Parser";
import { F2FSearch } from "./search.types";
import { Card, Condition } from "../../card.types";

export class F2FSearchParser implements Parser {
  constructor(protected searchString = '\\"searchResult\\":', protected store_host = 'https://facetofacegames.com') { }

  private cleanJsonString(str: string) {
    return str.replaceAll('\\"', '"').replaceAll('\\/', '/')
  }

  async extractItems(data: string) {
    const cards: Card[] = []
    let searchResults: F2FSearch;
    try {
      searchResults = JSON.parse(data)
    }
    catch(err){
      console.error(err)
      return { 
        result: [], 
        error: err?.toString() as string
       }
    }
    for (const hit of searchResults?.hits.hits) {
      const cardInfo = hit._source
      if (cardInfo.product_type.toLocaleLowerCase() !== 'singles') {
        continue;
      }

      for (const variant of cardInfo?.variants) {
        if (variant.inventoryQuantity > 0) {
          cards.push({
            image: this.cleanJsonString(variant.image.url),
            price: variant.price,
            currency: 'CAD',
            condition: variant.selectedOptions.find(item => item['name'] === 'Condition')?.value?.toLocaleLowerCase() as Condition ?? 'unknown',
            title: cardInfo.title,
            link: this.store_host + '/products/' + cardInfo.handle
          })

        }
      }

    }
    return { result: cards }

  }
}