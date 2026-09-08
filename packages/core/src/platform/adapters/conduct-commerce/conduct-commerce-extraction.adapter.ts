import { Injectable } from '@nestjs/common';
import { Condition } from '@scoutlgs/shared';
import type { Store } from '../../../database/store.entity';
import type { ExtractedCardVariant, IExtractionAdapter } from '../../platform.interfaces';
import { validateConductCommerceConfig } from '../../platform-config.validation';
import type { ConductCommerceConfig } from '@scoutlgs/shared';
import { ConductCardDetailExtractor } from './conduct-card-detail.extractor';
import { parseConditionAndFoil } from '../shopify/shopify-variant.utils';
import { ConductCommerceClient } from './conduct-commerce.client';
import type { ConductListing, ConductProductDetails } from './conduct-commerce.types';

const IMAGE_BASE = 'https://conduct-catalog-images.s3-us-west-2.amazonaws.com/normal/';
export type ConductCategoryExtraction = {
  category: { id?: number; name: string; visible: boolean };
  listingCount: number;
  variantCount: number;
  products: Array<{ inventoryID: number; variants: ExtractedCardVariant[] }>;
};

@Injectable()
export class ConductCommerceExtractionAdapter implements IExtractionAdapter {
  constructor(private readonly client: ConductCommerceClient, private readonly parser: ConductCardDetailExtractor) {}

  async extractProduct(store: Store, handle: string): Promise<ExtractedCardVariant[]> {
    const inventoryID = Number(handle);
    if (!Number.isInteger(inventoryID) || inventoryID < 1) throw new Error('Conduct product handle must be a numeric inventoryID');
    return this.normalizeDetails(store, await this.client.details(store, inventoryID));
  }

  async extractConfiguredSource(
    store: Store,
    onCategory?: (result: ConductCategoryExtraction) => Promise<void>,
  ): Promise<Array<{ inventoryID: number; variants: ExtractedCardVariant[] }>> {
    const valid = validateConductCommerceConfig(store.scraperConfig);
    if (!valid.valid) throw new Error(`Invalid Conduct configuration: ${valid.errors.join('; ')}`);
    const source = (valid.config as ConductCommerceConfig).source;
    if (source.mode === 'search') return this.consumeCategory(store, { name: `search:${source.query!.trim()}`, visible: true }, await this.client.listings(store, { search: source.query!.trim() }), onCategory);
    if (source.mode === 'category') return this.consumeCategory(store, { name: source.categoryName!.trim(), visible: true }, await this.client.listings(store, { category: source.categoryName!.trim() }), onCategory);
    const settings = await this.client.settings(store);
    const type = settings.categories.find((candidate) => candidate.id === source.productTypeId);
    if (!type) throw new Error(`Configured Conduct Magic product type ${source.productTypeId} is unavailable`);
    const output: Array<{ inventoryID: number; variants: ExtractedCardVariant[] }> = [];
    // Do not discard hidden categories: storefront visibility is not a
    // reliable inventory-scope signal, and live Conduct tenants expose them.
    for (const category of type.categories) {
      const products = await this.consumeCategory(store, {
        id: category.id, name: category.uniqueDisplayName, visible: category.visible !== 0,
      }, await this.client.listings(store, { productTypeID: type.id, category: category.uniqueDisplayName }), onCategory);
      output.push(...products);
    }
    return output;
  }

  private async consumeCategory(
    store: Store,
    category: ConductCategoryExtraction['category'],
    response: { listings: ConductListing[] },
    onCategory?: (result: ConductCategoryExtraction) => Promise<void>,
  ) {
    const products = this.normalizeListings(store, response.listings);
    const result: ConductCategoryExtraction = {
      category, products, listingCount: response.listings.length,
      variantCount: response.listings.reduce((total, listing) => total + listing.variants.length, 0),
    };
    if (onCategory) await onCategory(result);
    return onCategory ? [] : products;
  }

  normalizeListings(store: Store, listings: ConductListing[]) { return listings.map((listing) => ({ inventoryID: listing.inventoryID, variants: this.normalizeListing(store, listing) })); }
  normalizeDetails(store: Store, detail: ConductProductDetails) { return this.normalizeListing(store, detail, Object.fromEntries((detail.fields ?? []).map((field) => [field.name, field.value]))); }

  private normalizeListing(store: Store, listing: ConductListing, details: Record<string, string> = {}): ExtractedCardVariant[] {
    const title = this.parser.parseTitle(listing.inventoryName);
    if (title.isArtSeries) return [];
    const setName = details.Set || title.setName || listing.categoryName;
    const finish = String(details.Finish ?? listing.filterFields?.Finish ?? '');
    const imageUrl = listing.image ? listing.image.startsWith('https://') ? listing.image : IMAGE_BASE + listing.image : undefined;
    const currency = (store.scraperConfig as { currency?: string } | undefined)?.currency;
    if (!currency) throw new Error('Conduct store is missing configured currency');
    return listing.variants.map((variant) => {
      const condition = parseConditionAndFoil({ option1: variant.name, option2: finish, title: listing.inventoryName });
      return {
        cardName: title.cardName || listing.inventoryName, setName,
        setCode: details['Set Code'] || details.SetCode,
        collectorNumber: details['Collector Number'] || title.collectorNumber,
        condition: condition.condition === Condition.UNKNOWN ? Condition.NM : condition.condition,
        foil: condition.foil || /foil/i.test(finish), price: Number(variant.price), currency,
        inStock: Number(variant.quantity) > 0, quantity: Number.isFinite(Number(variant.quantity)) ? Number(variant.quantity) : undefined,
        imageUrl, productUrl: new URL(`/store/item/${listing.inventoryID}`, store.baseUrl).toString(),
        sku: details.SKU || details.Sku,
        platformVariantId: String(variant.id ?? `${listing.inventoryID}:${variant.variantCombinationID ?? variant.name}`),
        isToken: /\btoken\b/i.test(listing.inventoryName) || /\btoken\b/i.test(setName),
      };
    });
  }
}
