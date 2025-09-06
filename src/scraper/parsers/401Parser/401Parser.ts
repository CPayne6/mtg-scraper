import { writeFileSync } from "fs";
import { Card } from "../../card.types";
import { Parser } from "../Parser";
import { _401Search } from "./search.types";

interface _401ParserSearchConfig {
  store_uuid_regex: RegExp;
  store_id_regex: RegExp;
  path: string;
  host_regex: RegExp;
  params: URLSearchParams;
  store_host: string;
}

const defaultConfig: _401ParserSearchConfig = {
  store_id_regex: /STORE_ID = Number\("(\d+)"\);/,
  store_uuid_regex: /STORE_UUID = "(.*)";/,
  path: '/search/full_text_search',
  host_regex: /FAST_ENDPOINT = "(https:\/\/.+)"/,
  params: new URLSearchParams('sort_by=relevency&with_product_attributes=true&narrow=[["In Stock","True"]]&products_per_page=40'),
  store_host: 'https://store.401games.ca'
}

export class _401Parser implements Parser {
  protected searchConfig: _401ParserSearchConfig;

  constructor(config?: Partial<_401ParserSearchConfig>) {
    this.searchConfig = {
      ...defaultConfig,
      ...config
    }
  }

  async extractItems(data: string) {
    const cards: Card[] = [];
    // Loop through the items and filter out ones that don't have the right name or that are not available
    let parsedData;

    try{
      parsedData = JSON.parse(data)
    }catch (err){
      console.error(err)
      return {
        result: [],
        error: err?.toString() as string
      }
    }
    if (!Array.isArray(parsedData.items)) {
      return {
        result: [],
        error: 'data items not array'
      }
    }

    for (const item of parsedData.items) {
      const innerCards: Card[] = []
      // Iterate through the convoluted object structure
      for (const innerItem of item.vra) {
        const cardAttr = innerItem[1]
        const attrMap: Record<string, any> = {}
        let productCorrect = true

        for (let i = 0; Array.isArray(cardAttr) && i < cardAttr.length; i++) {
          const [name, [value]] = cardAttr[i] ?? [undefined, []]
          if (name && value) {
            attrMap[name] = value;
          }
          else {
            productCorrect = false;
            break;
          }
        }

        if (productCorrect && attrMap["Sellable"] !== false) {
          innerCards.push({
            condition: attrMap["Condition"]?.toLocaleLowerCase(),
            price: Number(attrMap["Price"]?.split(":").pop()),
            currency: attrMap["Price"]?.split(":").shift(),
            image: item.t,
            title: item.l,
            link: this.searchConfig.store_host + item.u
          })
        }
      }

      cards.push(...innerCards)
    }
    return { result: cards }
  }
}
