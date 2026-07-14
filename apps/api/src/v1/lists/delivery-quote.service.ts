import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { StorefrontClient, type Store } from '@scoutlgs/core';
import type { DeliveryAddressDto } from './dto/delivery-options.dto';

export interface DeliveryMethod { label: string; handle?: string; price: number }
interface QuotePayload { owner: string; listId: number; expiresAt: number; methods: Record<string, DeliveryMethod[]> }
const TTL_MS = 10 * 60_000;

@Injectable()
export class DeliveryQuoteService {
  private readonly logger = new Logger(DeliveryQuoteService.name);

  constructor(private readonly entityManager: EntityManager, private readonly storefront: StorefrontClient) {}

  async quote(owner: string, listId: number, storeKeys: string[], address: DeliveryAddressDto) {
    const unique = [...new Set(storeKeys.map((key) => key.trim()).filter(Boolean))];
    if (!unique.length) throw new BadRequestException('Select at least one store');
    const rows: Array<{ id: number; name: string; display_name: string; base_url: string; scraper_config: Store['scraperConfig'] }> = await this.entityManager.query(
      `SELECT id, name, display_name, base_url, scraper_config FROM stores WHERE is_active = TRUE AND name = ANY($1::text[])`, [unique],
    );
    if (rows.length !== unique.length) throw new BadRequestException('One or more selected stores are unavailable');
    const methods: Record<string, DeliveryMethod[]> = {};
    await Promise.all(rows.map(async (row) => {
      const variants: Array<{ platform_variant_id: string }> = await this.entityManager.query(
        `SELECT DISTINCT ON (e.id) v.platform_variant_id
         FROM card_list_entries e
         JOIN card_listings l ON l.card_name_id = e.card_name_id AND l.store_id = $2
         JOIN card_variants v ON v.card_listing_id = l.id
         WHERE e.card_list_id = $1 AND v.in_stock = TRUE AND v.platform_variant_id IS NOT NULL
         ORDER BY e.id, v.price ASC`, [listId, row.id],
      );
      const pickup: DeliveryMethod = { label: 'Pickup', handle: 'pickup', price: 0 };
      if (!variants.length) { methods[row.name] = [pickup]; return; }

      // A deck list stores one entry per required copy. Combine matching
      // variants so Shopify receives the actual quantity for this store's
      // purchasable portion of the deck, rather than a single sample card.
      const quantities = new Map<string, number>();
      for (const { platform_variant_id } of variants) {
        quantities.set(platform_variant_id, (quantities.get(platform_variant_id) ?? 0) + 1);
      }
      const lines = [...quantities.entries()].map(([platformVariantId, quantity]) => ({
        merchandiseId: `gid://shopify/ProductVariant/${platformVariantId}`,
        quantity,
      }));
      try {
        // StorefrontClient only needs these settings to construct and send the
        // request. Build a complete entity-shaped value rather than casting a
        // partial SQL row, which keeps this boundary type-safe.
        const store: Store = {
          id: row.id,
          uuid: '',
          name: row.name,
          displayName: row.display_name,
          baseUrl: row.base_url,
          isActive: true,
          scraperType: 'f2f',
          scraperConfig: row.scraper_config,
          platformType: 'shopify_storefront',
          rateLimitPerSecond: 15,
          createdAt: new Date(0),
          updatedAt: new Date(0),
        };
        const result = await this.storefront.query<{ cartCreate: { cart: { deliveryGroups: { edges: Array<{ node: { deliveryOptions: Array<{ title: string; code?: string; handle?: string; estimatedCost: { amount: string } }> } }> } } | null; userErrors: Array<{ message: string }> } }>(
          store,
          `mutation Quote($input: CartInput!) { cartCreate(input:$input) { cart { deliveryGroups(first:10) { edges { node { deliveryOptions { title handle code estimatedCost { amount } } } } } } userErrors { message } } }`,
          {
            input: {
              lines,
              buyerIdentity: { countryCode: address.countryCode.toUpperCase() },
              delivery: {
                addresses: [{
                  address: {
                    deliveryAddress: {
                      address1: address.address1,
                      ...(address.address2 ? { address2: address.address2 } : {}),
                      city: address.city,
                      provinceCode: address.province,
                      zip: address.postalCode,
                      countryCode: address.countryCode.toUpperCase(),
                    },
                  },
                  selected: true,
                  oneTimeUse: true,
                }],
              },
            },
          },
        );
        const errors = result.cartCreate.userErrors.map((error) => error.message);
        if (errors.length) throw new Error(`Shopify cartCreate rejected the delivery quote: ${errors.join('; ')}`);
        if (!result.cartCreate.cart) throw new Error('Shopify cartCreate returned no cart for the delivery quote');
        const options = result.cartCreate.cart.deliveryGroups.edges.flatMap((edge) => edge.node.deliveryOptions);
        methods[row.name] = [pickup, ...options.map((option) => ({ label: option.title, handle: option.handle ?? option.code, price: Number(option.estimatedCost.amount) })).filter((option) => Number.isFinite(option.price) && option.price >= 0)];
      } catch (error) {
        this.logger.warn(`Delivery quote failed for ${row.name}: ${(error as Error).message}`);
        methods[row.name] = [pickup];
      }
    }));
    const expiresAt = Date.now() + TTL_MS;
    // Delivery choices only affect a recommendation; they are not a checkout
    // commitment. Keep the quote client-contained, without a signing secret.
    return { methods, quoteToken: this.encode({ owner, listId, expiresAt, methods }), expiresAt };
  }

  consume(token: string, owner: string, listId: number, selected: Record<string, { label: string; handle?: string }> | undefined) {
    const payload = this.verify(token);
    if (payload.owner !== owner || payload.listId !== listId) throw new BadRequestException('Delivery quote does not belong to this list');
    if (payload.expiresAt < Date.now()) throw new BadRequestException('Delivery quote has expired');
    const shippingCostByStoreKey: Record<string, number> = {};
    const selectedMethodByStoreKey: Record<string, { label: string; handle?: string }> = {};
    for (const [store, methods] of Object.entries(payload.methods)) {
      const picked = selected?.[store];
      const method = methods.find((candidate) => candidate.label === picked?.label && candidate.handle === picked?.handle);
      if (!method) throw new BadRequestException(`Choose a valid delivery method for ${store}`);
      shippingCostByStoreKey[store] = method.price;
      selectedMethodByStoreKey[store] = { label: method.label, ...(method.handle ? { handle: method.handle } : {}) };
    }
    return { mode: 'quoted' as const, shippingCostByStoreKey, selectedMethodByStoreKey };
  }

  private encode(payload: QuotePayload) { return Buffer.from(JSON.stringify(payload)).toString('base64url'); }
  private verify(token: string): QuotePayload {
    try { return JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as QuotePayload; }
    catch { throw new BadRequestException('Invalid delivery quote'); }
  }
}
