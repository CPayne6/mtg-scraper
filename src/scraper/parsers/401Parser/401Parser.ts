import { writeFileSync } from "fs";
import { Card } from "../../card.types";
import { Parser } from "../Parser";
import { _401Search } from "./search.types";

const cardNameRegex = /^([^\(]+) \(/i

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
    let parsedData: _401Search;

    try {
      parsedData = JSON.parse(data)
    } catch (err) {
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

      let type = ''
      const attrMap: Record<string, any> = {}
      for (const att of item.att) {
        const name = att[0]
        const values = att[1]
        let productCorrect = true

        for (let i = 0; Array.isArray(values) && i < values.length; i++) {
          const value = values[i]
          if (name && value) {
            attrMap[name] = value;
          }
          if (name.toLocaleLowerCase() === 'type') {
            type = value
          }
          else {
            productCorrect = false;
            break;
          }
        }
      }

      if(type !== 'Magic: The Gathering Singles'){
        continue;
      }

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
          const cardName = item.l.match(cardNameRegex)?.[1].split(' - ')[0] ?? item.l
          const splitSku = (attrMap['Product-sku'] ?? attrMap['Barcode'])?.split('-')
          innerCards.push({
            condition: attrMap["Condition"]?.toLocaleLowerCase(),
            price: Number(attrMap["Price"]?.split(":").pop()),
            currency: attrMap["Price"]?.split(":").shift(),
            image: item.t,
            title: cardName,
            link: this.searchConfig.store_host + item.u,
            set: splitSku[2] ?? 'Unknown',
            card_number: String(Number(splitSku[3]?.replace(/\D/g,'')))
          })
        }
      }

      cards.push(...innerCards)
    }
    return { result: cards }
  }
}
