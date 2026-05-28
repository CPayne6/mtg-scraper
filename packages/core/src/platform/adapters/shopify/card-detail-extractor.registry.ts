import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import type { ICardDetailExtractor } from './card-detail-extractor.interface';
import { CARD_DETAIL_EXTRACTOR_METADATA } from './card-detail-extractor.decorator';
import { DefaultCardDetailExtractor } from './extractors/default/default-card-detail.extractor';
import { StoreService } from '../../../store/store.service';
import type { Store } from '../../../database/store.entity';

/**
 * Registry that discovers all `@CardDetailExtractor(...)` decorated providers
 * on boot and exposes them by scraperType.
 *
 * Why: adding a new extractor used to require editing 5 files (the extractor,
 * its barrel export, the platform module's providers + factory + inject array,
 * and the core index). Now it requires only the new file with the decorator.
 *
 * The registry also validates that all active stores have a known scraperType
 * after the store cache is refreshed — surfaces config drift as a warning
 * rather than a silent fallthrough to the default extractor.
 */
@Injectable()
export class CardDetailExtractorRegistry implements OnModuleInit {
  private readonly logger = new Logger(CardDetailExtractorRegistry.name);
  private readonly extractors = new Map<string, ICardDetailExtractor>();

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly reflector: Reflector,
    private readonly defaultExtractor: DefaultCardDetailExtractor,
    @Optional() private readonly storeService?: StoreService,
  ) {}

  onModuleInit(): void {
    this.discover();

    // Re-validate every time the store cache refreshes — surfaces config
    // drift when a store is added/changed with a new scraperType.
    if (this.storeService) {
      this.storeService.onCacheRefreshed((stores: Store[]) => {
        const scraperTypes = stores
          .map((s) => s.scraperType as string | undefined)
          .filter((t): t is string => Boolean(t));
        this.validateAgainstScraperTypes(scraperTypes);
      });
    }
  }

  /**
   * Scan all providers for `@CardDetailExtractor(...)` metadata and register
   * them by scraperType. Called automatically on module init.
   *
   * Public so tests and admin endpoints can re-trigger discovery.
   */
  discover(): void {
    this.extractors.clear();

    const providers = this.discoveryService.getProviders();

    for (const wrapper of providers) {
      const { instance } = wrapper;
      if (!instance || typeof instance !== 'object') continue;

      const ctor = (instance as object).constructor;
      if (!ctor) continue;

      const scraperTypes = this.reflector.get<string[] | undefined>(
        CARD_DETAIL_EXTRACTOR_METADATA,
        ctor,
      );
      if (!scraperTypes || scraperTypes.length === 0) continue;

      for (const scraperType of scraperTypes) {
        if (this.extractors.has(scraperType)) {
          this.logger.warn(
            `Duplicate extractor for scraperType="${scraperType}". ` +
              `Keeping ${this.extractors.get(scraperType)!.constructor.name}, ` +
              `ignoring ${ctor.name}.`,
          );
          continue;
        }
        this.extractors.set(scraperType, instance as ICardDetailExtractor);
      }
    }

    this.logger.log(
      `Discovered ${this.extractors.size} card detail extractors: ` +
        [...this.extractors.keys()].sort().join(', '),
    );
  }

  /**
   * Get the extractor for a scraperType, falling back to the default extractor
   * if no specific match is registered.
   */
  get(scraperType: string | null | undefined): ICardDetailExtractor {
    if (!scraperType) return this.defaultExtractor;
    return this.extractors.get(scraperType) ?? this.defaultExtractor;
  }

  /**
   * Check whether a specific scraperType has a registered extractor.
   * Use this to log warnings when the store cache contains a store with
   * a scraperType that has no dedicated extractor (will fall back to default).
   */
  has(scraperType: string): boolean {
    return this.extractors.has(scraperType);
  }

  /**
   * Validate that all scraperTypes in the given list have registered extractors.
   * Logs a warning for any that will fall back to the default. Call this from
   * StoreService after refreshing the cache to surface config drift early.
   *
   * @returns array of scraperTypes that have no dedicated extractor
   */
  validateAgainstScraperTypes(scraperTypes: Iterable<string>): string[] {
    const missing: string[] = [];
    for (const scraperType of scraperTypes) {
      if (!this.has(scraperType)) {
        missing.push(scraperType);
      }
    }
    if (missing.length > 0) {
      this.logger.warn(
        `Stores reference scraperType(s) with no dedicated extractor ` +
          `(falling back to default): ${[...new Set(missing)].sort().join(', ')}`,
      );
    }
    return missing;
  }

  /**
   * Returns all registered scraperType keys. Useful for diagnostics.
   */
  listScraperTypes(): string[] {
    return [...this.extractors.keys()].sort();
  }
}
