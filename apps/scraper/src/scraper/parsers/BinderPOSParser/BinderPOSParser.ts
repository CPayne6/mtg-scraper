import { Card } from '@scoutlgs/shared';
import { BaseParser, parseConditionWithFoil } from '../Parser';
import { BinderPOSSearch } from './search.types';

export class BinderPOSParser extends BaseParser {
  constructor(protected storeHost: string) {
    super();
  }

  async extractItems(
    data: string,
  ): Promise<{ result: Card[]; error?: string }> {
    const cards: Card[] = [];
    let parsedData: BinderPOSSearch;
    try {
      parsedData = JSON.parse(data);
    } catch (err) {
      this.logger.error('JSON parse error', err);
      return {
        result: [],
        error: `JSON parse error: ${err?.toString() as string}`,
      };
    }

    // If products is missing or not an array, card not found (not an error)
    if (!parsedData || !Array.isArray(parsedData.products)) {
      return { result: [] };
    }

    for (const product of parsedData.products) {
      try {
        if (!Array.isArray(product.variants)) {
          continue;
        }

        for (const variant of product.variants) {
          if (variant.quantity > 0) {
            const { condition, foil } = parseConditionWithFoil(variant.option1);
            cards.push({
              condition,
              foil,
              currency: 'CAD',
              image: product.img,
              link: this.storeHost + '/products/' + product.handle,
              price: variant.price,
              title: product.cardName,
              set: product.setCode,
              card_number: product.cardNumber,
            });
          }
        }
      } catch (err) {
        this.logger.error('Unexpected product structure', {
          product,
          error: err,
        });
        continue;
      }
    }

    return { result: cards };
  }
}
