import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Raw } from 'typeorm';
import { CardPrinting, CardName, ScryfallSet } from '@scoutlgs/core';
import { LRUCache } from 'lru-cache';
import Redis from 'ioredis';
import { PUBSUB_CHANNELS } from '@scoutlgs/shared';

export type NameMatchType = 'exact' | 'fuzzy' | 'frontface' | 'none';
/**
 * How the printing was selected.
 *   set_and_number — exact set + collector match
 *   set_only       — only one printing in the given set, no collector needed
 *   any            — no set info, picked the first printing
 *   ambiguous      — set matched but multiple printings exist; refuse to guess
 *   none           — no card_name resolved, no printing
 */
export type PrintingMatchType =
  | 'set_and_number'
  | 'set_only'
  | 'any'
  | 'ambiguous'
  | 'none';
/**
 * How we arrived at the set code used during matching.
 *   code_provided — extractor gave us a setCode directly (highest confidence)
 *   name_exact    — extractor gave a setName that exact-matched a set
 *   name_fuzzy    — extractor gave a setName resolved via ILIKE (lowest)
 *   none          — no set info, or set name didn't resolve
 */
export type SetMatchType = 'code_provided' | 'name_exact' | 'name_fuzzy' | 'none';

export interface MatchResult {
  cardPrintingId: number | null;
  cardNameId: number | null;
  /** Kept for backward compatibility — same as nameMatch. */
  confidence: 'exact' | 'fuzzy' | 'none';
  /** How the card_name was resolved. */
  nameMatch: NameMatchType;
  /** How the set was resolved from extractor input. */
  setMatch: SetMatchType;
  /** How the printing was selected once the card_name was known. */
  printingMatch: PrintingMatchType;
}

interface PrintingCacheEntry {
  cardPrintingId: number;
  cardNameId: number;
}

interface NameCacheEntry {
  cardNameId: number | null;
  nameMatch: NameMatchType;
}

@Injectable()
export class PrintingMatcherService implements OnModuleDestroy {
  private readonly logger = new Logger(PrintingMatcherService.name);

  // LRU cache: "setCode:collectorNumber" → { cardPrintingId, cardNameId }
  private readonly printingCache: LRUCache<string, PrintingCacheEntry>;
  // LRU cache: normalizedName → { cardNameId, confidence }
  private readonly nameCache: LRUCache<string, NameCacheEntry>;
  // LRU cache: set name → set code (empty string = not found)
  private readonly setNameCache: LRUCache<string, string>;

  /**
   * Resolved when warmCaches() finishes its initial DB load.
   * `match()` awaits this so jobs that get picked up during warm-up
   * still see a populated cache instead of racing against the loader.
   *
   * This fixes a class of "card exists but matcher returns null" bugs
   * where a job ran while the warm-cache DB query was mid-flight and
   * the negative DB result got cached for that name.
   */
  private warmupComplete: Promise<void> = Promise.resolve();

  private subscriber?: Redis;

  constructor(
    @InjectRepository(CardPrinting)
    private readonly cardPrintingRepository: Repository<CardPrinting>,
    @InjectRepository(CardName)
    private readonly cardNameRepository: Repository<CardName>,
    @InjectRepository(ScryfallSet)
    private readonly setRepository: Repository<ScryfallSet>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {
    this.printingCache = new LRUCache({ max: 100000 });
    this.nameCache = new LRUCache({ max: 50000 });
    this.setNameCache = new LRUCache({ max: 2000 });
  }

  /**
   * Listens for card-data-changed notifications from the Scryfall seed
   * scripts. When the seed publishes, we flush the in-memory caches and
   * re-warm from the now-populated card_names/sets tables so a fresh seed
   * doesn't require restarting the scraper.
   */
  subscribeToCardDataChanges(): void {
    if (this.subscriber) return;

    this.subscriber = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD'),
      maxRetriesPerRequest: null,
    });

    this.subscriber.on('error', (err) => {
      this.logger.error('card-data-changed subscriber error:', err);
    });

    this.subscriber.subscribe(PUBSUB_CHANNELS.CARD_DATA_CHANGED, (err) => {
      if (err) {
        this.logger.error(
          `Failed to subscribe to ${PUBSUB_CHANNELS.CARD_DATA_CHANGED}:`,
          err,
        );
      } else {
        this.logger.log(
          `Subscribed to ${PUBSUB_CHANNELS.CARD_DATA_CHANGED}`,
        );
      }
    });

    this.subscriber.on('message', (channel, message) => {
      if (channel !== PUBSUB_CHANNELS.CARD_DATA_CHANGED) return;
      this.logger.warn(
        `card-data-changed received (scope=${message}); flushing caches and re-warming`,
      );
      this.printingCache.clear();
      this.nameCache.clear();
      this.setNameCache.clear();
      void this.warmCaches();
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.subscriber) {
      this.subscriber.disconnect();
      this.subscriber = undefined;
    }
  }

  /**
   * Match an extracted variant to a card_printing record.
   * Strategy:
   *   1. Resolve card name from the extracted title (exact → frontface → trgm 0.8)
   *   2. Try exact set + collector lookup, but ONLY accept the result when its
   *      card_name matches the name resolved in step 1. This rejects the case
   *      where a product's SKU encodes a set+collector that happens to point
   *      at a different card than the title says — e.g. CG Realm's
   *      "Spirit Token (003)" SKU `MTG-IMA-3-...` shouldn't get attached to
   *      Abzan Falconer just because Abzan Falconer is IMA #3.
   *   3. If set_code is missing, try resolving from set name and retry step 2.
   *   4. Fall back to name-based printing match (set + collector → set-only → any).
   */
  async match(
    cardName: string,
    setCode?: string,
    collectorNumber?: string,
    setName?: string,
  ): Promise<MatchResult> {
    // Block until the warm-cache load is complete. Without this, jobs picked
    // up by BullMQ during startup hit a partially-populated cache and the
    // matcher's negative-result caching makes the miss sticky for the rest
    // of the run.
    await this.warmupComplete;

    // Normalize collector number: strip leading zeros (e.g. "016" → "16")
    if (collectorNumber) {
      collectorNumber = collectorNumber.replace(/^0+/, '') || '0';
    }

    // Track how we obtained the set code — populated below.
    let setMatch: SetMatchType = setCode ? 'code_provided' : 'none';

    // Resolve extracted card name first — used both for name-based matching
    // and to validate any SKU-based match.
    const normalizedName = this.stripParentheticals(this.normalizeCardName(cardName));
    const nameResult = await this.resolveCardName(normalizedName);

    // Try exact match by set_code + collector_number.
    // Accepted only if the printing's card_name matches the extracted title;
    // otherwise we treat the SKU as untrustworthy and fall through to the
    // name-based path (or to unmatched if the name doesn't resolve).
    if (setCode && collectorNumber && nameResult.cardNameId !== null) {
      const entry = await this.findBySetAndNumber(setCode, collectorNumber);
      if (entry && entry.cardNameId === nameResult.cardNameId) {
        return {
          cardPrintingId: entry.cardPrintingId,
          cardNameId: entry.cardNameId,
          confidence: 'exact',
          nameMatch: nameResult.nameMatch,
          setMatch,
          printingMatch: 'set_and_number',
        };
      }
    }

    // If no set_code but we have a set name, resolve it and retry the
    // SKU lookup with the same name-agreement guard.
    if (!setCode && setName) {
      const resolved = await this.resolveSetCode(setName);
      if (resolved.code) {
        setCode = resolved.code;
        setMatch = resolved.matchType;

        if (collectorNumber && nameResult.cardNameId !== null) {
          const entry = await this.findBySetAndNumber(resolved.code, collectorNumber);
          if (entry && entry.cardNameId === nameResult.cardNameId) {
            return {
              cardPrintingId: entry.cardPrintingId,
              cardNameId: entry.cardNameId,
              confidence: 'exact',
              nameMatch: nameResult.nameMatch,
              setMatch,
              printingMatch: 'set_and_number',
            };
          }
        }
      }
    }

    if (nameResult.cardNameId === null) {
      return {
        cardPrintingId: null,
        cardNameId: null,
        confidence: 'none',
        nameMatch: 'none',
        setMatch,
        printingMatch: 'none',
      };
    }

    // Stage 2: Find best printing for the resolved card name
    const printingResult = await this.resolvePrinting(nameResult.cardNameId, setCode, collectorNumber);

    // Ambiguous: set matched but multiple printings exist and we have no
    // collector number to disambiguate. Treat as unmatched rather than
    // silently picking the wrong art variant.
    if (printingResult.matchType === 'ambiguous') {
      return {
        cardPrintingId: null,
        cardNameId: nameResult.cardNameId,
        confidence: 'none',
        nameMatch: nameResult.nameMatch,
        setMatch,
        printingMatch: 'ambiguous',
      };
    }

    return {
      cardPrintingId: printingResult.printingId,
      cardNameId: nameResult.cardNameId,
      confidence: nameResult.nameMatch === 'frontface' ? 'exact' : (nameResult.nameMatch as 'exact' | 'fuzzy'),
      nameMatch: nameResult.nameMatch,
      setMatch,
      printingMatch: printingResult.matchType,
    };
  }

  /**
   * Stage 1: Resolve a normalized card name to a card_names.id.
   * Tries exact match first, then trgm fuzzy (threshold 0.8).
   */
  private async resolveCardName(normalizedName: string): Promise<NameCacheEntry> {
    const cached = this.nameCache.get(normalizedName);
    if (cached !== undefined) return cached;

    // Step 1: Exact match (fast, uses unique index)
    const exact = await this.cardNameRepository.findOne({
      where: { normalizedName },
      select: ['id'],
    });

    if (exact) {
      const result: NameCacheEntry = { cardNameId: exact.id, nameMatch: 'exact' };
      this.nameCache.set(normalizedName, result);
      return result;
    }

    // Step 1.5: Front-face match for double-faced cards
    // Stores list DFCs by front face only (e.g. "Neglected Heirloom")
    // but card_names stores full name ("Neglected Heirloom // Ashmouth Blade")
    const frontFace = await this.cardNameRepository.findOne({
      where: {
        normalizedName: Raw((alias) => `${alias} LIKE :p`, {
          p: `${normalizedName} // %`,
        }),
      },
      select: ['id'],
    });

    if (frontFace) {
      const result: NameCacheEntry = { cardNameId: frontFace.id, nameMatch: 'frontface' };
      this.nameCache.set(normalizedName, result);
      return result;
    }

    // Step 2: Fuzzy match — raw SQL because pg_trgm's `similarity()` operator
    // has no first-class TypeORM equivalent.
    const fuzzy = await this.dataSource.query(
      `SELECT id FROM card_names
       WHERE similarity(normalized_name, $1) > 0.8
       ORDER BY similarity(normalized_name, $1) DESC
       LIMIT 1`,
      [normalizedName],
    );

    if (fuzzy.length > 0) {
      const result: NameCacheEntry = { cardNameId: Number(fuzzy[0].id), nameMatch: 'fuzzy' };
      this.nameCache.set(normalizedName, result);
      return result;
    }

    // No match
    const result: NameCacheEntry = { cardNameId: null, nameMatch: 'none' };
    this.nameCache.set(normalizedName, result);
    return result;
  }

  /**
   * Stage 2: Find the best printing for a given card name ID.
   * Priority: set+number (1) → set only (2) → any printing (3).
   */
  private async resolvePrinting(
    cardNameId: number,
    setCode?: string,
    collectorNumber?: string,
  ): Promise<{ printingId: number | null; matchType: PrintingMatchType }> {
    const setCodeLower = setCode?.toLowerCase() ?? null;

    // LIMIT 2 so we can detect ambiguity at priority 2 (set-only with
    // multiple printings in the same set — different art variants, etc.).
    // Priority 1 (set+number) is unique by design (sets have a unique
    // (set_id, collector_number) constraint), so no ambiguity check there.
    const rows = await this.dataSource.query(
      `SELECT cp.id AS printing_id,
        CASE
          WHEN $2::varchar IS NOT NULL AND $3::varchar IS NOT NULL
            AND s.code = $2::varchar AND cp.collector_number = $3::varchar THEN 1
          WHEN $2::varchar IS NOT NULL AND s.code = $2::varchar THEN 2
          ELSE 3
        END AS priority
      FROM card_printings cp
      JOIN sets s ON s.id = cp.set_id
      WHERE cp.card_name_id = $1
      ORDER BY priority, cp.id
      LIMIT 2`,
      [cardNameId, setCodeLower, collectorNumber],
    );

    if (rows.length === 0) return { printingId: null, matchType: 'none' };

    const topPriority = Number(rows[0].priority);

    // Set matched but multiple printings exist for this card in that set
    // (e.g. basic land arts, showcase variants). Refuse to pick one — the
    // caller treats 'ambiguous' as unmatched so we don't silently mis-match.
    if (
      topPriority === 2 &&
      rows.length > 1 &&
      Number(rows[1].priority) === 2
    ) {
      return { printingId: null, matchType: 'ambiguous' };
    }

    const matchType: PrintingMatchType =
      topPriority === 1 ? 'set_and_number' : topPriority === 2 ? 'set_only' : 'any';

    return { printingId: Number(rows[0].printing_id), matchType };
  }

  /**
   * Resolve a set name (e.g. "Eighth Edition") to a set code (e.g. "8ed").
   * Tries exact name match first, then ILIKE for partial/fuzzy names.
   * Shortest matching name wins (most specific match).
   */
  private async resolveSetCode(
    setName: string,
  ): Promise<{ code: string | null; matchType: 'name_exact' | 'name_fuzzy' | 'none' }> {
    const key = setName.toLowerCase();
    const cached = this.setNameCache.get(key);
    if (cached !== undefined) {
      // Cache stores "code|matchType" or "" for not-found
      if (!cached) return { code: null, matchType: 'none' };
      const [code, matchType] = cached.split('|');
      return { code, matchType: matchType as 'name_exact' | 'name_fuzzy' };
    }

    // Try exact name match first (fast)
    const exact = await this.setRepository.findOne({
      where: { name: setName },
      select: ['code'],
    });

    if (exact) {
      this.setNameCache.set(key, `${exact.code}|name_exact`);
      this.logger.debug(`Resolved set name "${setName}" → ${exact.code} (exact)`);
      return { code: exact.code, matchType: 'name_exact' };
    }

    // Fall back to ILIKE (handles partial names like "Neon Dynasty" → "Kamigawa: Neon Dynasty")
    const fuzzy = await this.setRepository
      .createQueryBuilder('s')
      .select('s.code', 'code')
      .where('s.name ILIKE :pattern', { pattern: `%${setName}%` })
      .orderBy('LENGTH(s.name)', 'ASC')
      .limit(1)
      .getRawOne();

    if (fuzzy?.code) {
      this.setNameCache.set(key, `${fuzzy.code}|name_fuzzy`);
      this.logger.debug(`Resolved set name "${setName}" → ${fuzzy.code} (ILIKE)`);
      return { code: fuzzy.code, matchType: 'name_fuzzy' };
    }

    this.setNameCache.set(key, '');
    return { code: null, matchType: 'none' };
  }

  /**
   * Look up a printing by set_code + collector_number.
   * Returns both the printing ID and the card_name_id.
   */
  private async findBySetAndNumber(
    setCode: string,
    collectorNumber: string,
  ): Promise<PrintingCacheEntry | null> {
    const cacheKey = `${setCode.toLowerCase()}:${collectorNumber}`;
    const cached = this.printingCache.get(cacheKey);
    if (cached !== undefined) return cached;

    const rows = await this.dataSource.query(
      `SELECT cp.id, cp.card_name_id FROM card_printings cp
       JOIN sets s ON s.id = cp.set_id
       WHERE s.code = $1 AND cp.collector_number = $2
       LIMIT 1`,
      [setCode.toLowerCase(), collectorNumber],
    );

    if (rows.length > 0) {
      const entry: PrintingCacheEntry = {
        cardPrintingId: Number(rows[0].id),
        cardNameId: Number(rows[0].card_name_id),
      };
      this.printingCache.set(cacheKey, entry);
      return entry;
    }

    return null;
  }

  private normalizeCardName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/['']/g, "'")
      .replace(/[""]/g, '"');
  }

  /**
   * Strip parenthetical suffixes from card names.
   * "Shadowborn Apostle (Borderless)" → "shadowborn apostle"
   * "Abbey Gargoyles (Bertrand Lestree) (SB)" → "abbey gargoyles"
   * Also handles " - Promo Pack (Foil)" style suffixes.
   */
  private stripParentheticals(name: string): string {
    // Remove all trailing parenthetical groups
    let stripped = name.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
    // Remove trailing " - <variant info>" (e.g. " - Promo Pack", " - French")
    stripped = stripped.replace(/\s+-\s+(?:promo pack|french|german|italian|chinese|japanese|limited edition.*|unlimited.*|artist signed.*)$/i, '').trim();
    return stripped;
  }

  /**
   * Pre-warm the name and set caches by loading all card_names and sets.
   * This avoids per-product DB queries for the first encounter of each name.
   */
  async warmCaches(): Promise<void> {
    // Expose a promise that match() awaits, so callers that race the load
    // (e.g. BullMQ workers processing queued jobs during startup) wait
    // instead of seeing an empty cache and caching a negative DB result.
    this.warmupComplete = this.doWarmCaches();
    await this.warmupComplete;
  }

  private async doWarmCaches(): Promise<void> {
    this.logger.warn('Warming printing matcher caches...');

    const names = await this.cardNameRepository.find({
      select: ['id', 'normalizedName'],
    });
    for (const row of names) {
      this.nameCache.set(row.normalizedName, {
        cardNameId: row.id,
        nameMatch: 'exact',
      });
    }

    // Cache format: "code|matchType" (see resolveSetCode).
    const sets = await this.setRepository.find({
      select: ['name', 'code'],
    });
    for (const row of sets) {
      this.setNameCache.set(row.name.toLowerCase(), `${row.code}|name_exact`);
    }

    this.logger.warn(
      `Caches warmed: ${names.length} card names, ${sets.length} sets`,
    );
  }
}
