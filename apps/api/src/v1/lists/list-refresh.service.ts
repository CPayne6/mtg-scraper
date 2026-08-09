import { ConflictException, Injectable, NotFoundException, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { CardList, CardListEntry, CardListing, CardVariant, ShopifyProduct } from '@scoutlgs/core';
import { JOB_NAMES, QUEUE_NAMES, type CartProductRefreshJobData, type CartProductRefreshJobResult } from '@scoutlgs/shared';
import { In, Repository } from 'typeorm';
import type { PrincipalContext } from '../../auth/principal.types';
import { ListRescrapePolicy } from './list-rescrape.policy';
import { summarizeRefreshItemsByCard } from '../refresh-result-summary';
import { readRefreshJobProgress } from '../refresh-job-progress';

const COOLDOWN_SECONDS = 300;
// Lists identify cards by name, which would otherwise expand a basic land
// into every historical printing and store offer in the catalog. Basic lands
// deliberately remain in the saved list; they are simply not refresh targets.
const BASIC_LAND_NAMES = new Set([
  'Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes',
  'Snow-Covered Plains', 'Snow-Covered Island', 'Snow-Covered Swamp',
  'Snow-Covered Mountain', 'Snow-Covered Forest',
]);

export function isBasicLandName(name: string | undefined): boolean {
  return !!name && BASIC_LAND_NAMES.has(name);
}

/** Queues a bounded re-fetch of the known Shopify offers for an owned card list. */
@Injectable()
export class ListRefreshService implements OnModuleDestroy {
  private readonly redis: Redis;
  private readonly enforceCooldown: boolean;

  constructor(
    @InjectRepository(CardList) private readonly lists: Repository<CardList>,
    @InjectRepository(CardListEntry) private readonly entries: Repository<CardListEntry>,
    @InjectRepository(CardListing) private readonly listings: Repository<CardListing>,
    @InjectRepository(ShopifyProduct) private readonly products: Repository<ShopifyProduct>,
    @InjectQueue(QUEUE_NAMES.LIST_REFRESH) private readonly queue: Queue<CartProductRefreshJobData>,
    config: ConfigService,
    private readonly policy: ListRescrapePolicy,
  ) {
    this.redis = new Redis({ host: config.get('REDIS_HOST', 'localhost'), port: config.get('REDIS_PORT', 6379), password: config.get('REDIS_PASSWORD'), maxRetriesPerRequest: 2 });
    this.enforceCooldown = config.get<string>('NODE_ENV') === 'production';
  }

  private key(principalUuid: string) { return `list-refresh:${principalUuid}`; }
  async onModuleDestroy() { await this.redis.quit().catch(() => undefined); }

  async request(listUuid: string, principal: PrincipalContext) {
    if (!this.policy.isEnabled()) throw new ServiceUnavailableException('List refresh is not enabled');
    const list = await this.findOwned(listUuid, principal.principalUuid);
    const entries = await this.entries.find({ where: { cardListId: list.id }, relations: ['cardName'] });
    if (!entries.length) throw new ConflictException('Card list is empty');
    if (entries.length > 150) throw new ConflictException('Card list exceeds the 150-card refresh limit');
    if (this.enforceCooldown) {
      const claimed = await this.redis.set(this.key(principal.principalUuid), 'pending', 'EX', COOLDOWN_SECONDS, 'NX');
      if (claimed !== 'OK') throw new ConflictException({ message: 'List refresh is on cooldown or already running', retryAfterSec: Math.max(1, await this.redis.ttl(this.key(principal.principalUuid))) });
    }

    try {
      const cardNameIds = [...new Set(entries
        .filter((entry) => !isBasicLandName(entry.cardName?.name))
        .map((entry) => entry.cardNameId))];
      const listings = await this.listings.find({ where: { cardNameId: In(cardNameIds) }, relations: ['store', 'cardName', 'variants'] });
      const listingIds = listings.map((listing) => listing.id);
      // Older rows only have product_url_id. Join through that durable unique
      // association as well as the newer direct listing mapping.
      const productRows = listingIds.length ? await this.products.createQueryBuilder('sp')
        .leftJoin(CardListing, 'cl', 'cl.id = sp.card_listing_id OR (cl.store_id = sp.store_id AND cl.product_url_id = sp.product_url_id)')
        .where('cl.id IN (:...ids)', { ids: listingIds }).getMany() : [];
      const productByListing = new Map<number, ShopifyProduct>();
      for (const product of productRows) {
        if (product.cardListingId) productByListing.set(product.cardListingId, product);
        const listing = listings.find((candidate) => candidate.storeId === product.storeId && candidate.productUrlId === product.productUrlId);
        if (listing) productByListing.set(listing.id, product);
      }
      const snapshot = listings.flatMap((listing) => listing.variants.map((variant) => {
        const product = productByListing.get(listing.id);
        const supported = listing.store.platformType === 'shopify_storefront' && !!product;
        const title = listing.cardName?.name ?? listing.rawTitle ?? 'Unknown card';
        return { variantId: variant.id, title, cardKey: listing.cardNameId ? `card:${listing.cardNameId}` : `name:${title.toLowerCase()}`, previousPrice: Number(variant.price), storeId: supported ? listing.storeId : undefined, shopifyProductId: supported ? product!.shopifyProductId : undefined };
      }));
      const grouped = new Map<number, Map<string, Set<number>>>();
      for (const listing of listings) {
        const product = productByListing.get(listing.id);
        if (listing.store.platformType !== 'shopify_storefront' || !product) continue;
        let products = grouped.get(listing.storeId);
        if (!products) { products = new Map(); grouped.set(listing.storeId, products); }
        let listingIds = products.get(product.shopifyProductId);
        if (!listingIds) { listingIds = new Set(); products.set(product.shopifyProductId, listingIds); }
        listingIds.add(listing.id);
      }
      const targets = [...grouped].map(([storeId, products]) => ({ storeId, products: [...products].map(([productId, listingIds]) => ({ productId, listingIds: [...listingIds] })) }));
      const totalProducts = targets.reduce((total, target) => total + target.products.length, 0);
      const job = await this.queue.add(JOB_NAMES.CART_PRODUCT_REFRESH, {
        principalUuid: principal.principalUuid,
        listUuid,
        snapshot,
        targets,
        totalProducts,
      }, { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 300, removeOnFail: 300 });
      if (this.enforceCooldown) await this.redis.set(this.key(principal.principalUuid), job.id!, 'EX', COOLDOWN_SECONDS);
      return { jobId: job.id, status: 'queued' as const, cooldownExpiresAt: new Date(Date.now() + COOLDOWN_SECONDS * 1000).toISOString() };
    } catch (error) { if (this.enforceCooldown) await this.redis.del(this.key(principal.principalUuid)); throw error; }
  }

  async status(listUuid: string, principal: PrincipalContext, jobId: string) {
    await this.findOwned(listUuid, principal.principalUuid);
    const job = await this.queue.getJob(jobId);
    if (!job || job.name !== JOB_NAMES.CART_PRODUCT_REFRESH || job.data.principalUuid !== principal.principalUuid || job.data.listUuid !== listUuid) throw new NotFoundException('Refresh job not found');
    const state = await job.getState();
    const status = state === 'completed' ? 'completed' : state === 'failed' ? 'failed' : state === 'active' ? 'running' : 'queued';
    const result = (job.returnvalue ?? { items: [], success: status !== 'failed' }) as CartProductRefreshJobResult;
    const progress = status === 'completed' ? 100 : await readRefreshJobProgress(job);
    return { jobId, status, progress, items: summarizeRefreshItemsByCard(result.items), failedReason: status === 'failed' ? job.failedReason : undefined };
  }

  private async findOwned(listUuid: string, principalUuid: string) {
    const list = await this.lists.findOne({ where: { uuid: listUuid } });
    if (!list || list.ownerPrincipalUuid !== principalUuid || list.expiresAt < new Date()) throw new NotFoundException('List not found');
    return list;
  }
}
