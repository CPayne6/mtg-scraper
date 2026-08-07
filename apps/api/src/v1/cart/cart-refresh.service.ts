import { ConflictException, Injectable, NotFoundException, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { CardCart, CardListing, CardVariant, ShopifyProduct } from '@scoutlgs/core';
import { JOB_NAMES, QUEUE_NAMES, type CartProductRefreshJobData, type CartProductRefreshJobResult } from '@scoutlgs/shared';
import { In, IsNull, Repository } from 'typeorm';
import type { PrincipalContext } from '../../auth/principal.types';
import { CartRescrapePolicy } from './cart-rescrape.policy';

const COOLDOWN_SECONDS = 300;

@Injectable()
export class CartRefreshService implements OnModuleDestroy {
  private readonly redis: Redis;
  constructor(
    @InjectRepository(CardCart) private readonly carts: Repository<CardCart>,
    @InjectRepository(CardVariant) private readonly variants: Repository<CardVariant>,
    @InjectRepository(CardListing) private readonly listings: Repository<CardListing>,
    @InjectRepository(ShopifyProduct) private readonly products: Repository<ShopifyProduct>,
    @InjectQueue(QUEUE_NAMES.STOREFRONT_EXTRACTION) private readonly queue: Queue<CartProductRefreshJobData>,
    config: ConfigService,
    private readonly policy: CartRescrapePolicy,
  ) {
    this.redis = new Redis({ host: config.get('REDIS_HOST', 'localhost'), port: config.get('REDIS_PORT', 6379), password: config.get('REDIS_PASSWORD'), maxRetriesPerRequest: 2 });
  }
  private key(principalUuid: string) { return `cart-refresh:${principalUuid}`; }
  async onModuleDestroy() { await this.redis.quit().catch(() => undefined); }

  async request(principal: PrincipalContext) {
    if (!this.policy.isEnabled()) throw new ServiceUnavailableException('Cart refresh is not enabled');
    const cart = await this.carts.findOne({ where: { ownerPrincipalUuid: principal.principalUuid } });
    if (!cart?.cardVariantIds.length) throw new ConflictException('Cart is empty');
    if (cart.cardVariantIds.length > 150) throw new ConflictException('Cart exceeds the 150-item refresh limit');
    const claimed = await this.redis.set(this.key(principal.principalUuid), 'pending', 'EX', COOLDOWN_SECONDS, 'NX');
    if (claimed !== 'OK') {
      throw new ConflictException({ message: 'Cart refresh is on cooldown or already running', retryAfterSec: Math.max(1, await this.redis.ttl(this.key(principal.principalUuid))) });
    }
    try {
      const variants = await this.variants.find({ where: { id: In(cart.cardVariantIds) }, relations: ['cardListing', 'cardListing.store', 'cardListing.cardName', 'cardListing.cardPrinting'] });
      // Exact printing is the only cross-store identity.  If an old/unmatched
      // listing has no printing, fall back only to equally-unprinted listings
      // for its canonical card name; this deliberately avoids mixing editions.
      const printingIds = variants.flatMap((variant) => variant.cardListing.cardPrintingId ? [variant.cardListing.cardPrintingId] : []);
      const fallbackNameIds = variants.flatMap((variant) => !variant.cardListing.cardPrintingId && variant.cardListing.cardNameId ? [variant.cardListing.cardNameId] : []);
      const knownListings = [
        ...(printingIds.length ? await this.listings.find({ where: { cardPrintingId: In(printingIds) }, relations: ['store', 'cardName', 'variants'] }) : []),
        ...(fallbackNameIds.length ? await this.listings.find({ where: { cardNameId: In(fallbackNameIds), cardPrintingId: IsNull() }, relations: ['store', 'cardName', 'variants'] }) : []),
      ];
      const listingsById = new Map(knownListings.map((listing) => [listing.id, listing]));
      const listingIds = [...listingsById.keys()];
      const productRows = listingIds.length ? await this.products.find({ where: { cardListingId: In(listingIds) } }) : [];
      const productByListing = new Map(productRows.map((product) => [product.cardListingId, product]));
      const snapshot = variants.map((variant) => {
        const selectedListing = variant.cardListing;
        const product = productByListing.get(selectedListing.id);
        const supported = selectedListing.store.platformType === 'shopify_storefront';
        return { variantId: variant.id, title: variant.cardListing.cardName?.name ?? variant.cardListing.rawTitle ?? 'Unknown card', previousPrice: Number(variant.price), storeId: supported ? variant.cardListing.storeId : undefined, shopifyProductId: supported ? product?.shopifyProductId : undefined };
      });
      const grouped = new Map<number, Map<string, Set<number>>>();
      for (const listing of listingsById.values()) {
        const product = productByListing.get(listing.id);
        if (listing.store.platformType !== 'shopify_storefront' || !product) continue;
        let products = grouped.get(listing.storeId);
        if (!products) { products = new Map(); grouped.set(listing.storeId, products); }
        let ids = products.get(product.shopifyProductId);
        if (!ids) { ids = new Set(); products.set(product.shopifyProductId, ids); }
        ids.add(listing.id);
      }
      const job = await this.queue.add(JOB_NAMES.CART_PRODUCT_REFRESH, { principalUuid: principal.principalUuid, snapshot, targets: [...grouped].map(([storeId, products]) => ({ storeId, products: [...products].map(([productId, ids]) => ({ productId, listingIds: [...ids] })) })) }, { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 300, removeOnFail: 300 });
      await this.redis.set(this.key(principal.principalUuid), job.id!, 'EX', COOLDOWN_SECONDS);
      return { jobId: job.id, status: 'queued' as const, cooldownExpiresAt: new Date(Date.now() + COOLDOWN_SECONDS * 1000).toISOString() };
    } catch (error) { await this.redis.del(this.key(principal.principalUuid)); throw error; }
  }

  async status(principal: PrincipalContext, jobId: string) {
    const job = await this.queue.getJob(jobId);
    if (!job || job.name !== JOB_NAMES.CART_PRODUCT_REFRESH || job.data.principalUuid !== principal.principalUuid) throw new NotFoundException('Refresh job not found');
    const state = await job.getState();
    const status = state === 'completed' ? 'completed' : state === 'failed' ? 'failed' : state === 'active' ? 'running' : 'queued';
    const result = (job.returnvalue ?? { items: [], success: status !== 'failed' }) as CartProductRefreshJobResult;
    return { jobId, status, items: result.items, failedReason: status === 'failed' ? job.failedReason : undefined };
  }
}
