import { Parser } from "../Parser";
import { F2FSearch } from "./search.types";
import { Card, Condition } from "@mtg-scraper/shared";
import { isValidSetCode } from "@/scraper/sets";

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
      if (cardInfo.product_type.toLocaleLowerCase() !== 'singles' || cardInfo["Game Type"][0] !== "Magic: The Gathering") {
        continue;
      }

      for (const variant of cardInfo?.variants) {
        if (variant.inventoryQuantity > 0) {
          const setSplit = variant.sku.split('-')
          cards.push({
            image: this.cleanJsonString(variant.image.url),
            price: variant.price,
            currency: 'CAD',
            condition: variant.selectedOptions.find(item => item['name'] === 'Condition')?.value?.toLocaleLowerCase() as Condition ?? 'unknown',
            title: Array.isArray(cardInfo["Card Name"]) ? cardInfo["Card Name"][0] : cardInfo["Card Name"],
            link: this.store_host + '/products/' + cardInfo.handle,
            set: setSplit.reduce<string | undefined>((prev, curr) => prev ?? (isValidSetCode(curr) ? curr.toLocaleLowerCase() : undefined), undefined)?.toLocaleUpperCase() ?? 'Unknown',
            card_number: String(cardInfo['Collector Number'] ?? cardInfo['MTG_Collector_Number'])
          })
        }
      }

    }
    return { result: cards }

  }
}