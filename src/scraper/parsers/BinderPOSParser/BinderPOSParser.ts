import { Card, Condition } from "@/scraper/card.types";
import { Parser } from "../Parser";
import { BinderPOSSearch } from "./search.types";

export class BinderPOSParser implements Parser {
  constructor(protected storeHost: string) { }

  async extractItems(data: string): Promise<{ result: Card[]; error?: boolean | string; }> {
    const cards: Card[] = []
    let parsedData: BinderPOSSearch
    try {
      parsedData = JSON.parse(data)
    }
    catch (err) {
      return {
        result: [],
        error: 'Unable to parse json data'
      }
    }

    if (!parsedData || !Array.isArray(parsedData.products)) {
      return {
        result: [],
        error: 'Unable to find products data'
      }
    }
    const products = parsedData.products
    for (const product of products) {
      if (!Array.isArray(product.variants)) {
        continue
      }

      for (const variant of product.variants) {
        if (variant.quantity > 0) {
          cards.push({
            condition: variant.option1.match(/\b(\w)/g)?.map(str => str.toLocaleLowerCase()).join('') as Condition ?? 'unknown',
            currency: 'CAD',
            image: product.img,
            link: this.storeHost + '/products/' + product.handle,
            price: variant.price,
            title: product.title
          })
        }
      }
    }
    return {
      result: cards
    }
  }
}
