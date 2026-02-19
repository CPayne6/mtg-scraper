import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataSource } from 'typeorm';
import { CardPrinting, ScryfallSet } from '@scoutlgs/core';
import { LRUCache } from 'lru-cache';

export interface MatchResult {
  cardPrintingId: number | null;
  cardNameId: number | null;
  confidence: 'exact' | 'fuzzy' | 'none';
}

interface PrintingCacheEntry {
  cardPrintingId: number;
  cardNameId: number;
}

interface NameCacheEntry {
  cardNameId: number | null;
  confidence: 'exact' | 'fuzzy' | 'none';
}

@Injectable()
export class PrintingMatcherService {
  private readonly logger = new Logger(PrintingMatcherService.name);

  // LRU cache: "setCode:collectorNumber" → { cardPrintingId, cardNameId }
  private readonly printingCache: LRUCache<string, PrintingCacheEntry>;
  // LRU cache: normalizedName → { cardNameId, confidence }
  private readonly nameCache: LRUCache<string, NameCacheEntry>;
  // LRU cache: set name → set code (empty string = not found)
  private readonly setNameCache: LRUCache<string, string>;

  constructor(
    @InjectRepository(CardPrinting)
    private readonly cardPrintingRepository: Repository<CardPrinting>,
    @InjectRepository(ScryfallSet)
    private readonly setRepository: Repository<ScryfallSet>,
    private readonly dataSource: DataSource,
  ) {
    this.printingCache = new LRUCache({ max: 10000 });
    this.nameCache = new LRUCache({ max: 10000 });
    this.setNameCache = new LRUCache({ max: 1000 });
  }

  /**
   * Match an extracted variant to a card_printing record.
   * Strategy:
   *   1. Exact: set_code + collector_number via sets join → returns both IDs
   *   2. Set name → set_code resolution (when set_code missing but setName provided)
   *   3. Stage 1: Resolve card name (exact → trgm 0.8 fallback)
   *   4. Stage 2: Find best printing for that card name
   */
  async match(
    cardName: string,
    setCode?: string,
    collectorNumber?: string,
    setName?: string,
  ): Promise<MatchResult> {
    // Normalize collector number: strip leading zeros (e.g. "016" → "16")
    if (collectorNumber) {
      collectorNumber = collectorNumber.replace(/^0+/, '') || '0';
    }

    // Try exact match by set_code + collector_number
    if (setCode && collectorNumber) {
      const entry = await this.findBySetAndNumber(setCode, collectorNumber);
      if (entry) {
        return { cardPrintingId: entry.cardPrintingId, cardNameId: entry.cardNameId, confidence: 'exact' };
      }
    }

    // If no set_code but we have a set name, resolve it
    if (!setCode && setName) {
      const resolved = await this.resolveSetCode(setName);
      if (resolved) {
        setCode = resolved;

        // Try exact match again with resolved set code
        if (collectorNumber) {
          const entry = await this.findBySetAndNumber(resolved, collectorNumber);
          if (entry) {
            return { cardPrintingId: entry.cardPrintingId, cardNameId: entry.cardNameId, confidence: 'exact' };
          }
        }
      }
    }

    // Stage 1: Resolve card name
    const normalizedName = this.normalizeCardName(cardName);
    const nameResult = await this.resolveCardName(normalizedName);

    if (nameResult.cardNameId === null) {
      return { cardPrintingId: null, cardNameId: null, confidence: 'none' };
    }

    // Stage 2: Find best printing for the resolved card name
    const printingId = await this.resolvePrinting(nameResult.cardNameId, setCode, collectorNumber);

    return {
      cardPrintingId: printingId,
      cardNameId: nameResult.cardNameId,
      confidence: nameResult.confidence,
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
    const exact = await this.dataSource.query(
      `SELECT id FROM card_names WHERE normalized_name = $1 LIMIT 1`,
      [normalizedName],
    );

    if (exact.length > 0) {
      const result: NameCacheEntry = { cardNameId: Number(exact[0].id), confidence: 'exact' };
      this.nameCache.set(normalizedName, result);
      return result;
    }

    // Step 2: Fuzzy match (trgm, only runs when exact fails)
    const fuzzy = await this.dataSource.query(
      `SELECT id FROM card_names
       WHERE similarity(normalized_name, $1) > 0.8
       ORDER BY similarity(normalized_name, $1) DESC
       LIMIT 1`,
      [normalizedName],
    );

    if (fuzzy.length > 0) {
      const result: NameCacheEntry = { cardNameId: Number(fuzzy[0].id), confidence: 'fuzzy' };
      this.nameCache.set(normalizedName, result);
      return result;
    }

    // No match
    const result: NameCacheEntry = { cardNameId: null, confidence: 'none' };
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
  ): Promise<number | null> {
    const setCodeLower = setCode?.toLowerCase() ?? null;

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
      LIMIT 1`,
      [cardNameId, setCodeLower, collectorNumber],
    );

    if (rows.length === 0) return null;
    return Number(rows[0].printing_id);
  }

  /**
   * Resolve a set name (e.g. "Eighth Edition") to a set code (e.g. "8ed")
   * by looking up the sets table.
   */
  private async resolveSetCode(setName: string): Promise<string | null> {
    const key = setName.toLowerCase();
    const cached = this.setNameCache.get(key);
    if (cached !== undefined) return cached || null;

    const set = await this.setRepository.findOne({
      where: { name: setName },
      select: ['code'],
    });

    const setCode = set?.code ?? '';
    this.setNameCache.set(key, setCode);

    if (setCode) {
      this.logger.debug(`Resolved set name "${setName}" → ${setCode}`);
    }

    return setCode || null;
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
}
