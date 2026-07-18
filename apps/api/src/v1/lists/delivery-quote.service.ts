import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { In, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { CardVariant, Store, StorefrontClient } from '@scoutlgs/core';
import type { SelectedCartOffer } from '@scoutlgs/core';
import type { DeliveryAddressDto } from './dto/delivery-options.dto';

export interface DeliveryOption {
  label: string;
  handle?: string;
  methodType?: string;
  price: number;
  currency: string;
}
export interface DeliveryGroup { id?: string; options: DeliveryOption[] }
export type StoreDeliveryQuote =
  | { state: 'quoted'; store: string; storeName: string; groups: DeliveryGroup[] }
  | { state: 'unavailable'; store: string; storeName: string };

const PROVINCES = new Set(['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT']);
const POSTAL = /^[ABCEGHJKLMNPRSTVXY]\d[ABCEGHJKLMNPRSTVWXYZ] \d[ABCEGHJKLMNPRSTVWXYZ]\d$/;

@Injectable()
export class DeliveryQuoteService {
  private readonly logger = new Logger(DeliveryQuoteService.name);
  constructor(
    @InjectRepository(Store) private readonly stores: Repository<Store>,
    @InjectRepository(CardVariant) private readonly variants: Repository<CardVariant>,
    private readonly storefront: StorefrontClient,
  ) {}

  async quoteSelected(selectedOffers: SelectedCartOffer[], addressInput: DeliveryAddressDto): Promise<{ stores: StoreDeliveryQuote[] }> {
    const address = this.normalizeAddress(addressInput);
    const byStore = new Map<string, SelectedCartOffer[]>();
    for (const selected of selectedOffers) {
      if (!selected.offer.variant_id || !selected.storeKey) throw new BadRequestException('The completed optimization contains an unavailable Shopify variant');
      byStore.set(selected.storeKey, [...(byStore.get(selected.storeKey) ?? []), selected]);
    }
    if (!byStore.size) throw new BadRequestException('The completed optimization contains no selected variants');
    // The queue result is a snapshot. Re-check that every selected Shopify
    // variant is still attached to the intended active store before asking a
    // merchant for rates; never substitute a different listing here.
    const expected = new Set(selectedOffers.map((item) => `${item.storeKey}:${item.offer.variant_id}`));
    const live = await this.variants.createQueryBuilder('variant')
      .innerJoinAndSelect('variant.cardListing', 'listing')
      .innerJoinAndSelect('listing.store', 'store')
      .where('variant.inStock = :inStock', { inStock: true })
      .andWhere('store.isActive = :isActive', { isActive: true })
      .andWhere('store.name IN (:...stores)', { stores: [...byStore.keys()] })
      .andWhere('variant.platformVariantId IN (:...variantIds)', { variantIds: selectedOffers.map((item) => item.offer.variant_id!) })
      .getMany();
    const actual = new Set(live.map((item) => `${item.cardListing.store.name}:${item.platformVariantId}`));
    if ([...expected].some((key) => !actual.has(key))) throw new BadRequestException('One or more selected Shopify variants are no longer available');
    const rows = await this.stores.find({ where: { name: In([...byStore.keys()]), isActive: true } });
    const deadline = Date.now() + 45_000;
    const stores = await this.withConcurrency(rows, 2, async (row) => {
      if (Date.now() >= deadline) return { state: 'unavailable' as const, store: row.name, storeName: row.displayName };
      const selected = byStore.get(row.name) ?? [];
      const quantities = new Map<string, number>();
      for (const item of selected) quantities.set(item.offer.variant_id!, (quantities.get(item.offer.variant_id!) ?? 0) + 1);
      const store = this.asStore(row);
      try {
        const created = await this.storefront.query<{ cartCreate: { cart: { id: string } | null; userErrors: Array<{ message: string }> } }>(
          store,
          'mutation Quote($input: CartInput!) { cartCreate(input:$input) { cart { id } userErrors { message } } }',
          { input: { lines: [...quantities].map(([id, quantity]) => ({ merchandiseId: `gid://shopify/ProductVariant/${id}`, quantity })), buyerIdentity: { countryCode: 'CA' }, delivery: { addresses: [{ address: { deliveryAddress: address }, selected: true, oneTimeUse: true }] } } },
        );
        if (created.cartCreate.userErrors.length || !created.cartCreate.cart) throw new Error('cart rejected');
        const quoted = await this.storefront.queryDeferred<{ cart?: { deliveryGroups?: { edges?: Array<{ node: { id?: string; deliveryOptions?: Array<{ title: string; handle?: string; code?: string; deliveryMethodType?: string; estimatedCost?: { amount: string; currencyCode: string } }> } }> } } }>(
          store,
          'query Delivery($id: ID!) { cart(id:$id) { ... @defer { deliveryGroups(first:250, withCarrierRates:true) { edges { node { id deliveryOptions { title handle code deliveryMethodType estimatedCost { amount currencyCode } } } } } } } }',
          { id: created.cartCreate.cart.id },
        );
        const groups = quoted.cart?.deliveryGroups?.edges?.map(({ node }) => ({ id: node.id, options: (node.deliveryOptions ?? []).map((option) => ({ label: option.title, handle: option.handle ?? option.code, methodType: option.deliveryMethodType, price: Number(option.estimatedCost?.amount), currency: option.estimatedCost?.currencyCode ?? 'CAD' })).filter((option) => Number.isFinite(option.price) && option.price >= 0) })) ?? [];
        return { state: 'quoted' as const, store: row.name, storeName: row.displayName, groups };
      } catch (error) {
        // A failed quote remains explicitly unavailable; never invent pickup.
        this.logger.warn(`Delivery quote unavailable for ${row.name}: ${(error as Error).message}`);
        return { state: 'unavailable' as const, store: row.name, storeName: row.displayName };
      }
    });
    // A stale/inactive store still needs an editable fallback in the UI.
    for (const [name] of byStore) if (!rows.some((row) => row.name === name)) stores.push({ state: 'unavailable', store: name, storeName: name });
    return { stores };
  }

  private normalizeAddress(value: DeliveryAddressDto) {
    const address1 = value.address1?.trim(); const city = value.city?.trim();
    const provinceCode = value.province?.trim().toUpperCase();
    const zip = value.postalCode?.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^(.{3})(.{3})$/, '$1 $2');
    if (value.countryCode?.trim().toUpperCase() !== 'CA' || !address1 || !city || !PROVINCES.has(provinceCode) || !zip || !POSTAL.test(zip)) throw new BadRequestException('Enter a complete Canadian delivery address');
    return { address1, ...(value.address2?.trim() ? { address2: value.address2.trim() } : {}), city, provinceCode, zip, countryCode: 'CA' };
  }

  private asStore(row: Store): Store { return row; }

  private async withConcurrency<T, R>(values: T[], max: number, fn: (value: T) => Promise<R>): Promise<R[]> {
    const result: R[] = []; let next = 0;
    const workers = Array.from({ length: Math.min(max, values.length) }, async () => { while (next < values.length) { const index = next++; result[index] = await fn(values[index]); } });
    await Promise.all(workers); return result;
  }
}
