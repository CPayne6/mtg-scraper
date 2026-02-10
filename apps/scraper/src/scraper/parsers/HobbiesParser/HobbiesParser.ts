import { Card } from '@scoutlgs/shared';
import { BaseParser, parseConditionWithFoil } from '../Parser';
import { HobbiesSearch } from './search.types';

const nameRegex = /^([^\(]+) \(/i;

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
  params: new URLSearchParams(
    'mongo=true&override_buylist_gt_price=true&product_line=All&sort=Relevance&limit=30&fields=id%2CproductId%2Cavailability%2Cstock%2CselectedFinish%2Curl%2CimageUrl%2Cprice%2CsalePrice%2CregularPrice%2Cname%2CvariantInfo%2CbigCommerceImages%2Cmsrp%2Ctags%2Cpublisher%2CinventoryLevels%2CcustomCollectionImages&convert_to_currency=CAD&round_price=true&in_stock=true',
  ),
};

export class HobbiesParser extends BaseParser {
  protected searchConfig: HobbiesParserConfig;
  constructor(config?: Partial<HobbiesParserConfig>) {
    super();
    this.searchConfig = {
      ...defaultConfig,
      ...config,
    };
  }
  async extractItems(page: string) {
    const cards: Card[] = [];
    let parsedData: HobbiesSearch;

    try {
      parsedData = JSON.parse(page);
    } catch (err) {
      this.logger.error('JSON parse error', err);
      return {
        result: [],
        error: `JSON parse error: ${err?.toString() as string}`,
      };
    }

    // If products is missing or empty, card not found (not an error)
    if (
      !Array.isArray(parsedData?.products) ||
      parsedData.products.length === 0
    ) {
      return { result: [] };
    }

    for (const product of parsedData.products) {
      try {
        const variantInfo = product.variantInfo ?? product.variant_info;

        if (!variantInfo) {
          continue;
        }

        // Check for foil from product-level fields (tags array, selectedFinish)
        const tags: string[] = Array.isArray(product.tags) ? product.tags : [];
        const productFoil =
          tags.some(
            (tag) =>
              (/Finish[:\s]*foil/i.test(tag) || /Foil or Non-Foil[:\s]*Foil/i.test(tag)) &&
              !/non-?foil/i.test(tag),
          ) ||
          (typeof product.selectedFinish === 'string' &&
            /\bfoil\b/i.test(product.selectedFinish) &&
            !/non-?foil/i.test(product.selectedFinish));

        const innerCards: Card[] = [];
        for (const variant of variantInfo) {
          if (variant.inventory_quantity > 0) {
            const splitDisplayName = product.display_name.split('-');
            const { condition, foil: conditionFoil } = parseConditionWithFoil(variant.title);
            // Use foil from condition string if present, otherwise from product-level fields
            const foil = conditionFoil || productFoil;
            innerCards.push({
              price: variant.price,
              currency: 'CAD',
              image: product.imageUrl ?? product.image_url,
              condition,
              foil,
              title:
                product.display_name.match(nameRegex)?.[1] ??
                product.display_name,
              link: product.url,
              set:
                splitDisplayName[0]?.substring(
                  splitDisplayName[0].lastIndexOf('(') + 1,
                  splitDisplayName[0].length,
                ) ?? 'Unknown',
              card_number: String(
                Number(
                  splitDisplayName[1]?.substring(
                    0,
                    splitDisplayName[1].indexOf(')'),
                  ),
                ),
              ),
            });
          }
        }

        cards.push(...innerCards);
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
