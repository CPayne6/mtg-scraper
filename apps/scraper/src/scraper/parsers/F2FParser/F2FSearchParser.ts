import { BaseParser, parseCondition } from '../Parser';
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

        for (const variant of cardInfo?.variants) {
          if (variant.inventoryQuantity > 0) {
            const setSplit = variant.sku.split('-');
            cards.push({
              image: this.cleanJsonString(variant.image.url),
              price: variant.price,
              currency: 'CAD',
              condition: parseCondition(
                variant.selectedOptions.find(
                  (item) => item['name'] === 'Condition',
                )?.value,
              ),
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
