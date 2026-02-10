import { BaseParser, parseConditionWithFoil } from '../Parser';
import { F2FSearch } from './search.types';
import { Card } from '@scoutlgs/shared';
import { isValidSetCode } from '@/scraper/sets';

export class F2FSearchParser extends BaseParser {
  constructor(
    protected searchString = '\\"searchResult\\":',
    protected store_host = 'https://facetofacegames.com',
  ) {
    super();
  }

  private cleanJsonString(str: string) {
    return str.replaceAll('\\"', '"').replaceAll('\\/', '/');
  }

  async extractItems(data: string) {
    const cards: Card[] = [];
    let searchResults: F2FSearch;
    try {
      searchResults = JSON.parse(data);
    } catch (err) {
      this.logger.error('JSON parse error', err);
      return {
        result: [],
        error: `JSON parse error: ${err?.toString() as string}`,
      };
    }

    // If response structure is invalid or empty, card not found (not an error)
    if (
      !searchResults ||
      typeof searchResults !== 'object' ||
      !searchResults.hits ||
      typeof searchResults.hits !== 'object' ||
      !Array.isArray(searchResults.hits.hits) ||
      searchResults.hits.hits.length === 0
    ) {
      return { result: [] };
    }

    for (const hit of searchResults.hits.hits) {
      try {
        const cardInfo = hit._source;
        if (
          cardInfo.product_type.toLocaleLowerCase() !== 'singles' ||
          cardInfo['Game Type'][0] !== 'Magic: The Gathering'
        ) {
          continue;
        }

        // Check for foil from Finish field (e.g., "Foil", "Non-Foil")
        const finishField = cardInfo['Finish'];
        const productFoil = Array.isArray(finishField)
          ? finishField.some((f: string) => /\bfoil\b/i.test(f) && !/non-?foil/i.test(f))
          : typeof finishField === 'string' && /\bfoil\b/i.test(finishField) && !/non-?foil/i.test(finishField);

        for (const variant of cardInfo?.variants) {
          if (variant.inventoryQuantity > 0) {
            const setSplit = variant.sku.split('-');
            const conditionValue = variant.selectedOptions.find(
              (item) => item['name'] === 'Condition',
            )?.value;
            const { condition, foil: conditionFoil } = parseConditionWithFoil(conditionValue);
            // Use foil from condition string if present, otherwise from product Finish field
            const foil = conditionFoil || productFoil;
            cards.push({
              image: this.cleanJsonString(variant.image.url),
              price: variant.price,
              currency: 'CAD',
              condition,
              foil,
              title: Array.isArray(cardInfo['Card Name'])
                ? cardInfo['Card Name'][0]
                : cardInfo['Card Name'],
              link: this.store_host + '/products/' + cardInfo.handle,
              set:
                setSplit
                  .reduce<
                    string | undefined
                  >((prev, curr) => prev ?? (isValidSetCode(curr) ? curr.toLocaleLowerCase() : undefined), undefined)
                  ?.toLocaleUpperCase() ?? 'Unknown',
              card_number: String(
                cardInfo['Collector Number'] ??
                  cardInfo['MTG_Collector_Number'],
              ),
            });
          }
        }
      } catch (err) {
        this.logger.error('Unexpected hit structure', { hit, error: err });
        continue;
      }
    }
    return { result: cards };
  }
}
