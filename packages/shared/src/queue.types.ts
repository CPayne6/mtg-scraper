export const QUEUE_NAMES = {
  STOREFRONT_EXTRACTION: 'storefront-extraction',
  /** Interactive exact-ID offer refreshes must not wait behind catalog discovery. */
  LIST_REFRESH: 'list-refresh',
  CARD_OPTIMIZATION: 'card-optimization',
} as const;

export const PUBSUB_CHANNELS = {
  CARD_DATA_CHANGED: 'scoutlgs:card-data-changed',
} as const;

export const JOB_NAMES = {
  CARD_OPTIMIZATION: 'optimize-card-list',
  /**
   * Per-store plan job: probes the store's `created_at` range and fans out
   * one bucket job per year. Replaces the legacy id-based bootstrap.
   */
  STOREFRONT_PLAN: 'storefront-plan',
  /**
   * Per-date-range bucket job. Cursor-paginates products matching
   * `scope created_at:>='start' created_at:<'end'`. On 25K depth-limit hit,
   * splits the date range in half and enqueues two child bucket jobs.
   */
  STOREFRONT_BUCKET: 'storefront-bucket',
  /**
   * Re-fetches unmatched products from the upstream Shopify Storefront API
   * and runs them through the current extraction pipeline. Use this to
   * apply extractor fixes (better title parsing, new SKU formats, etc.)
   * to products that previously failed to match — works even when the
   * stored `raw_name` is wrong because we pull fresh data from Shopify.
   */
  REEXTRACT_UNMATCHED: 'reextract-unmatched',
  /** Recover locally-known offers when a created_at bucket cannot split further. */
  STOREFRONT_KNOWN_OFFER_RECOVERY: 'storefront-known-offer-recovery',
  CART_PRODUCT_REFRESH: 'cart-product-refresh',
} as const;

export interface CardOptimizationJobData {
  listId: number;
  listUuid: string;
  listName: string;
  stores: string[] | null;
  minimumCondition: string;
  conditionFlexibility?: 'strict' | 'allow-if-needed' | 'allow-if-cheaper';
  maxDowngradeSteps?: number;
  downgradePenaltyPerStep?: number;
  /** Always the initial CA$3/store sourcing estimate. Never contains an address or cart id. */
  delivery: {
    mode: 'legacy';
  shippingCostByStoreKey: Record<string, number>;
  };
  /** Existing cart entries used to skip already-owned cards and price delivery stores. */
  initialCart?: Array<{ title: string; store_key: string }>;
  enqueuedAt: number;
}

/**
 * Platform types for extraction adapters
 */
export type PlatformType = 'shopify' | 'shopify_storefront' | 'conduct_commerce';

/**
 * Per-store opt-in flag for scheduled extraction. Stored in
 * stores.discovery_config (the column name is a leftover from the V2
 * pipeline; the V3 storefront flow only uses `discoveryEnabled`).
 */
export interface StoreDiscoveryConfig {
  discoveryEnabled: boolean;
  discoverySchedule?: string;
}

/**
 * Job data for re-extracting unmatched products from Shopify.
 * Scoped per-store; the worker pulls the store's unmatched product IDs
 * in batches, fetches them via Storefront API, and runs them through
 * the current extraction pipeline (which uses the latest extractor logic).
 */
export interface ReextractUnmatchedJobData {
  /** Required — re-extraction queries Shopify per-store. */
  storeId: number;
  /** Max products to re-fetch in this job. Default 5000. */
  limit?: number;
  /** Limit retries to products extracted from these set codes. */
  setCodes?: string[];
  /**
   * Re-fetch listings whose card name matched but whose Scryfall printing did
   * not. This is used after a catalog repair so those offers gain their set,
   * collector number, and printing image without re-crawling a whole store.
   */
  repairMissingPrintings?: boolean;
}

export interface ReextractUnmatchedJobResult {
  storeId: number;
  attempted: number;
  refetched: number;
  matched: number;
  stillUnmatched: number;
  errors: number;
  success: boolean;
}

export type CartRefreshOutcome = 'refreshed' | 'price_changed' | 'unavailable' | 'unsupported' | 'unconfirmed';
export interface CartRefreshSnapshotItem { variantId: number; title: string; previousPrice: number; cardKey?: string; storeId?: number; shopifyProductId?: string; }
/** A de-duplicated Shopify product and every known local listing it backs. */
export interface CartProductRefreshProductTarget { productId: string; listingIds: number[]; }
export interface CartProductRefreshTarget { storeId: number; products: CartProductRefreshProductTarget[]; }
export interface CartProductRefreshJobData {
  principalUuid: string;
  /** Present for card-list initiated refreshes. */
  listUuid?: string;
  snapshot: CartRefreshSnapshotItem[];
  targets: CartProductRefreshTarget[];
  /** Calculated before enqueueing so progress has a fixed, exact denominator. */
  totalProducts?: number;
}
export interface CartRefreshItemResult { variantId: number; title: string; cardKey?: string; outcome: CartRefreshOutcome; previousPrice: number; price?: number; message?: string; }
export interface CartProductRefreshJobResult { items: CartRefreshItemResult[]; success: boolean; }
export interface StorefrontKnownOfferRecoveryJobData { storeId: number; createdAtStart: string; createdAtEnd: string; discoveryRunId?: number; }

/**
 * Per-store plan job. Probes the store's `created_at` range and fans out
 * one bucket job per year between the min and max. The bucket jobs then
 * cursor-paginate within their date range.
 *
 */
export interface StorefrontPlanJobData {
  storeId: number;
  discoveryRunId?: number;
}

/**
 * Job data for cursor-paginating one date bucket.
 *
 * Lifecycle:
 *   1. Plan job creates the initial bucket with `cursor: null` and a year-wide
 *      date range.
 *   2. The processor fetches one page and, if `nextCursor` is non-null,
 *      re-enqueues the same bucket with `cursor: nextCursor`.
 *   3. If Shopify returns the 25K depth error, the processor halves the
 *      date range and enqueues two child buckets with `bucketDepth + 1`.
 *
 * `bucketDepth` caps the recursive splitting (year → ~6mo → ~3mo → ~1mo → ~2wk).
 */
export interface StorefrontBucketJobData {
  storeId: number;
  scope: string;
  /** Inclusive ISO-8601 lower bound on created_at. */
  createdAtStart: string;
  /** Exclusive ISO-8601 upper bound on created_at. */
  createdAtEnd: string;
  /** Opaque Shopify pageInfo.endCursor. Null for the first page of the bucket. */
  cursor: string | null;
  /** 0 for year-wide buckets created by the plan job; +1 per recursive split. */
  bucketDepth: number;
  discoveryRunId?: number;
  /**
   * Number of times the failed-bucket cron sweeper has re-enqueued this job
   * after it permanently failed. Capped by the sweeper so a chronically-
   * broken bucket (e.g. one Shopify can no longer serve at all) doesn't
   * cycle forever between failed and wait.
   */
  sweeperAttempts?: number;
}

export interface StorefrontBucketJobResult {
  storeId: number;
  createdAtStart: string;
  createdAtEnd: string;
  productsProcessed: number;
  cardsAdded: number;
  errors: number;
  /** True if `nextCursor === null` — bucket fully drained. */
  isBucketComplete: boolean;
  /** True if this job hit the 25K wall and spawned two child buckets. */
  wasSplit: boolean;
  success: boolean;
  error?: string;
}
