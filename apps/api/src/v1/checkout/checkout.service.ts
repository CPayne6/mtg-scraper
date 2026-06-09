import { Injectable, Logger } from '@nestjs/common';
import { StoreService } from '@scoutlgs/core';
import type { PrincipalContext } from '../../auth/principal.types';
import { CartService, type CartItemResponse } from '../cart/cart.service';
import { CheckoutAuditService } from './checkout-audit.service';
import { CheckoutRateLimiterService } from './checkout-rate-limiter.service';
import {
  buildCartPermalink,
  normalizeLines,
  resolveStoreHost,
} from './util/cart-permalink';

export interface StoreCheckoutEntry {
  storeKey: string;
  checkoutUrl: string;
}

export type BuildCheckoutResult =
  | { kind: 'ok'; stores: StoreCheckoutEntry[] }
  | { kind: 'rate-limited'; retryAfterSec: number }
  | { kind: 'unknown-store'; storeKey: string }
  | { kind: 'too-many-lines'; total: number; max: number }
  | { kind: 'empty-cart' }
  | { kind: 'error' };

interface CheckoutStoreInput {
  storeKey: string;
  lines: Array<{ variantId: string; quantity: number }>;
}

// Per-principal budget: anonymous principals get a tight bucket, signed-in
// users get a looser one. Both bucketed in a single 1-minute window because
// the same key gets both buckets -- so an attacker can't bypass the strict
// anon limit by minting fresh anonymous sessions.
const RATE_LIMIT_WINDOW_SEC = 60;
const RATE_LIMIT_PER_ANON = 5;
const RATE_LIMIT_PER_USER = 20;
const RATE_LIMIT_PER_IP = 30;
const MAX_TOTAL_CARDS = 150;
const MAX_QUANTITY_PER_LINE = 20;

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly storeService: StoreService,
    private readonly rateLimiter: CheckoutRateLimiterService,
    private readonly auditService: CheckoutAuditService,
    private readonly cartService: CartService,
  ) {}

  async buildCheckout(
    principal: PrincipalContext,
    ipHash: string,
    uaHash: string | null,
  ): Promise<BuildCheckoutResult> {
    const startedAt = Date.now();
    let storeCount = 0;
    let totalLines = 0;
    let totalSucceeded = 0;
    let errorClass: string | null = null;

    try {
      const principalLimit =
        principal.kind === 'user' ? RATE_LIMIT_PER_USER : RATE_LIMIT_PER_ANON;
      const [principalDecision, ipDecision] = await Promise.all([
        this.rateLimiter.check(
          `checkout:p:${principal.principalUuid}`,
          principalLimit,
          RATE_LIMIT_WINDOW_SEC,
        ),
        this.rateLimiter.check(
          `checkout:ip:${ipHash}`,
          RATE_LIMIT_PER_IP,
          RATE_LIMIT_WINDOW_SEC,
        ),
      ]);

      if (!principalDecision.allowed || !ipDecision.allowed) {
        errorClass = 'rate-limited';
        return {
          kind: 'rate-limited',
          retryAfterSec: Math.max(
            principalDecision.retryAfterSec,
            ipDecision.retryAfterSec,
          ),
        };
      }

      const cart = await this.cartService.getCart(principal);
      if (cart.variantIds.length > MAX_TOTAL_CARDS) {
        errorClass = 'validation';
        return {
          kind: 'too-many-lines',
          total: cart.variantIds.length,
          max: MAX_TOTAL_CARDS,
        };
      }

      const checkoutStores = this.buildStoreInputs(cart.items);
      storeCount = checkoutStores.length;
      totalLines = checkoutStores.reduce((sum, s) => sum + s.lines.length, 0);
      const totalCards = checkoutStores.reduce(
        (sum, s) => sum + s.lines.reduce((lineSum, l) => lineSum + l.quantity, 0),
        0,
      );

      if (totalCards === 0) {
        errorClass = 'validation';
        return { kind: 'empty-cart' };
      }

      if (totalCards > MAX_TOTAL_CARDS) {
        errorClass = 'validation';
        return { kind: 'too-many-lines', total: totalCards, max: MAX_TOTAL_CARDS };
      }

      const stores = await this.storeService.findAllActive();
      const byKey = new Map(stores.map((s) => [s.name, s]));

      // Whitelist pass before any URL building so we never return a
      // partial-success body to the client.
      for (const entry of checkoutStores) {
        if (!byKey.has(entry.storeKey)) {
          errorClass = 'validation';
          return { kind: 'unknown-store', storeKey: entry.storeKey };
        }
      }

      const results: StoreCheckoutEntry[] = checkoutStores.map((entry) => {
        const store = byKey.get(entry.storeKey)!;
        const host = resolveStoreHost(store);
        const lines = normalizeLines(entry.lines, MAX_QUANTITY_PER_LINE);
        return {
          storeKey: entry.storeKey,
          checkoutUrl: buildCartPermalink(host, lines),
        };
      });

      totalSucceeded = results.length;
      return { kind: 'ok', stores: results };
    } catch (err) {
      errorClass = 'unknown';
      this.logger.error(
        `checkout build failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
      return { kind: 'error' };
    } finally {
      // Fire-and-forget short-lived audit -- the response shouldn't wait on
      // Redis, and a dropped cache log is preferable to a slow checkout.
      const durationMs = Date.now() - startedAt;
      void this.auditService.record({
        principalUuid: principal.principalUuid,
        principalKind: principal.kind,
        ipHash,
        uaHash: uaHash ?? undefined,
        storeCount,
        totalLines,
        totalSucceededStores: totalSucceeded,
        totalFailedStores: errorClass ? storeCount : 0,
        requestDurationMs: durationMs,
        errorClass: errorClass ?? undefined,
      }).catch((err) => {
        this.logger.error(
          `checkout audit cache write failed: ${(err as Error).message}`,
        );
      });
    }
  }

  private buildStoreInputs(items: CartItemResponse[]): CheckoutStoreInput[] {
    const byStore = new Map<string, CheckoutStoreInput>();

    for (const item of items) {
      if (!item.variant_id) continue;

      let entry = byStore.get(item.store_key);
      if (!entry) {
        entry = { storeKey: item.store_key, lines: [] };
        byStore.set(item.store_key, entry);
      }

      const existing = entry.lines.find((line) => line.variantId === item.variant_id);
      if (existing) {
        existing.quantity += 1;
      } else {
        entry.lines.push({ variantId: item.variant_id, quantity: 1 });
      }
    }

    return Array.from(byStore.values());
  }
}
