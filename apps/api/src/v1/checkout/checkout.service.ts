import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CheckoutBuild, StoreService } from '@scoutlgs/core';
import type { PrincipalContext } from '../../auth/principal.types';
import { CheckoutRateLimiterService } from './checkout-rate-limiter.service';
import { BuildCheckoutDto } from './dto/build-checkout.dto';
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
  | { kind: 'error' };

// Per-principal budget: anonymous principals get a tight bucket, signed-in
// users get a looser one. Both bucketed in a single 1-minute window because
// the same key gets both buckets -- so an attacker can't bypass the strict
// anon limit by minting fresh anonymous sessions.
const RATE_LIMIT_WINDOW_SEC = 60;
const RATE_LIMIT_PER_ANON = 5;
const RATE_LIMIT_PER_USER = 20;
const RATE_LIMIT_PER_IP = 30;
const MAX_TOTAL_LINES = 200;
const MAX_QUANTITY_PER_LINE = 20;

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    @InjectRepository(CheckoutBuild)
    private readonly auditRepo: Repository<CheckoutBuild>,
    private readonly storeService: StoreService,
    private readonly rateLimiter: CheckoutRateLimiterService,
  ) {}

  async buildCheckout(
    dto: BuildCheckoutDto,
    principal: PrincipalContext,
    ipHash: string,
    uaHash: string | null,
  ): Promise<BuildCheckoutResult> {
    const startedAt = Date.now();
    const storeCount = dto.stores.length;
    const totalLines = dto.stores.reduce((sum, s) => sum + s.lines.length, 0);
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

      if (totalLines > MAX_TOTAL_LINES) {
        errorClass = 'validation';
        return { kind: 'too-many-lines', total: totalLines, max: MAX_TOTAL_LINES };
      }

      const stores = await this.storeService.findAllActive();
      const byKey = new Map(stores.map((s) => [s.name, s]));

      // Whitelist pass before any URL building so we never return a
      // partial-success body to the client.
      for (const entry of dto.stores) {
        if (!byKey.has(entry.storeKey)) {
          errorClass = 'validation';
          return { kind: 'unknown-store', storeKey: entry.storeKey };
        }
      }

      const results: StoreCheckoutEntry[] = dto.stores.map((entry) => {
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
      // Fire-and-forget audit -- the response shouldn't wait on the insert,
      // and a slow audit row is preferable to a slow checkout.
      const durationMs = Date.now() - startedAt;
      void this.writeAudit({
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
          `audit row write failed: ${(err as Error).message}`,
        );
      });
    }
  }

  private async writeAudit(data: {
    principalUuid: string;
    principalKind: 'anonymous' | 'user';
    ipHash: string;
    uaHash?: string;
    storeCount: number;
    totalLines: number;
    totalSucceededStores: number;
    totalFailedStores: number;
    requestDurationMs: number;
    errorClass?: string;
  }): Promise<void> {
    const entry = this.auditRepo.create(data);
    await this.auditRepo.save(entry);
  }
}
