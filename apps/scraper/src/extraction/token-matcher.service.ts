import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { TokenName, TokenPrinting, ScryfallSet } from '@scoutlgs/core';
import { LRUCache } from 'lru-cache';

export interface TokenMatchResult {
  tokenPrintingId: number | null;
  tokenNameId: number | null;
  confidence: 'exact' | 'fuzzy' | 'none';
}

interface PrintingCacheEntry {
  tokenPrintingId: number;
  tokenNameId: number;
}

interface NameCacheEntry {
  tokenNameId: number | null;
  confidence: 'exact' | 'fuzzy' | 'none';
}

@Injectable()
export class TokenMatcherService {
  private readonly logger = new Logger(TokenMatcherService.name);

  // LRU cache: "setCode:collectorNumber" → { tokenPrintingId, tokenNameId }
  private readonly printingCache: LRUCache<string, PrintingCacheEntry>;
  // LRU cache: normalizedName → { tokenNameId, confidence }
  private readonly nameCache: LRUCache<string, NameCacheEntry>;
  // LRU cache: set name → set code (empty string = not found)
  private readonly setNameCache: LRUCache<string, string>;

  constructor(
    @InjectRepository(TokenPrinting)
    private readonly tokenPrintingRepository: Repository<TokenPrinting>,
    @InjectRepository(TokenName)
    private readonly tokenNameRepository: Repository<TokenName>,
    @InjectRepository(ScryfallSet)
    private readonly setRepository: Repository<ScryfallSet>,
    private readonly dataSource: DataSource,
  ) {
    this.printingCache = new LRUCache({ max: 5000 });
    this.nameCache = new LRUCache({ max: 5000 });
    this.setNameCache = new LRUCache({ max: 1000 });
  }

  /**
   * Match an extracted token variant to a token_printing record.
   * Strategy:
   *   1. Exact: set_code + collector_number via sets join
   *   2. Set name → set_code resolution
   *   3. Stage 1: Resolve token name (exact → trgm 0.7 fallback)
   *   4. Stage 2: Find best printing for that token name
   */
  async match(
    cardName: string,
    setCode?: string,
    collectorNumber?: string,
    setName?: string,
  ): Promise<TokenMatchResult> {
    // Normalize collector number: strip leading zeros
    if (collectorNumber) {
      collectorNumber = collectorNumber.replace(/^0+/, '') || '0';
    }

    // Try exact match by set_code + collector_number
    if (setCode && collectorNumber) {
      const entry = await this.findBySetAndNumber(setCode, collectorNumber);
      if (entry) {
        return { tokenPrintingId: entry.tokenPrintingId, tokenNameId: entry.tokenNameId, confidence: 'exact' };
      }
    }

    // If no set_code but we have a set name, resolve it
    if (!setCode && setName) {
      const resolved = await this.resolveSetCode(setName);
      if (resolved) {
        setCode = resolved;

        if (collectorNumber) {
          const entry = await this.findBySetAndNumber(resolved, collectorNumber);
          if (entry) {
            return { tokenPrintingId: entry.tokenPrintingId, tokenNameId: entry.tokenNameId, confidence: 'exact' };
          }
        }
      }
    }

    // Stage 1: Resolve token name
    const normalizedName = this.normalizeCardName(cardName);
    const nameResult = await this.resolveTokenName(normalizedName);

    if (nameResult.tokenNameId === null) {
      return { tokenPrintingId: null, tokenNameId: null, confidence: 'none' };
    }

    // Stage 2: Find best printing for the resolved token name
    const printingId = await this.resolvePrinting(nameResult.tokenNameId, setCode, collectorNumber);

    return {
      tokenPrintingId: printingId,
      tokenNameId: nameResult.tokenNameId,
      confidence: nameResult.confidence,
    };
  }

  /**
   * Stage 1: Resolve a normalized token name to a token_names.id.
   * Tries exact match first, then trgm fuzzy (threshold 0.7, lower than
   * cards since token names are shorter/more generic).
   */
  private async resolveTokenName(normalizedName: string): Promise<NameCacheEntry> {
    const cached = this.nameCache.get(normalizedName);
    if (cached !== undefined) return cached;

    // Step 1: Exact match
    const exact = await this.tokenNameRepository.findOne({
      where: { normalizedName },
      select: ['id'],
    });

    if (exact) {
      const result: NameCacheEntry = { tokenNameId: exact.id, confidence: 'exact' };
      this.nameCache.set(normalizedName, result);
      return result;
    }

    // Step 2: Fuzzy match — raw SQL because pg_trgm's `similarity()` has no
    // first-class TypeORM equivalent.
    const fuzzy = await this.dataSource.query(
      `SELECT id FROM token_names
       WHERE similarity(normalized_name, $1) > 0.7
       ORDER BY similarity(normalized_name, $1) DESC
       LIMIT 1`,
      [normalizedName],
    );

    if (fuzzy.length > 0) {
      const result: NameCacheEntry = { tokenNameId: Number(fuzzy[0].id), confidence: 'fuzzy' };
      this.nameCache.set(normalizedName, result);
      return result;
    }

    // No match
    const result: NameCacheEntry = { tokenNameId: null, confidence: 'none' };
    this.nameCache.set(normalizedName, result);
    return result;
  }

  /**
   * Stage 2: Find the best printing for a given token name ID.
   * Priority: set+number (1) → set only (2) → any printing (3).
   */
  private async resolvePrinting(
    tokenNameId: number,
    setCode?: string,
    collectorNumber?: string,
  ): Promise<number | null> {
    const setCodeLower = setCode?.toLowerCase() ?? null;

    const rows = await this.dataSource.query(
      `SELECT tp.id AS printing_id,
        CASE
          WHEN $2::varchar IS NOT NULL AND $3::varchar IS NOT NULL
            AND s.code = $2::varchar AND tp.collector_number = $3::varchar THEN 1
          WHEN $2::varchar IS NOT NULL AND s.code = $2::varchar THEN 2
          ELSE 3
        END AS priority
      FROM token_printings tp
      JOIN sets s ON s.id = tp.set_id
      WHERE tp.token_name_id = $1
      ORDER BY priority, tp.id
      LIMIT 1`,
      [tokenNameId, setCodeLower, collectorNumber],
    );

    if (rows.length === 0) return null;
    return Number(rows[0].printing_id);
  }

  /**
   * Resolve a set name to a set code.
   */
  private async resolveSetCode(setName: string): Promise<string | null> {
    const key = setName.toLowerCase();
    const cached = this.setNameCache.get(key);
    if (cached !== undefined) return cached || null;

    const exact = await this.setRepository.findOne({
      where: { name: setName },
      select: ['code'],
    });

    if (exact) {
      this.setNameCache.set(key, exact.code);
      return exact.code;
    }

    const fuzzy = await this.setRepository
      .createQueryBuilder('s')
      .select('s.code', 'code')
      .where('s.name ILIKE :pattern', { pattern: `%${setName}%` })
      .orderBy('LENGTH(s.name)', 'ASC')
      .limit(1)
      .getRawOne();

    const setCode = fuzzy?.code ?? '';
    this.setNameCache.set(key, setCode);
    return setCode || null;
  }

  /**
   * Look up a token printing by set_code + collector_number.
   */
  private async findBySetAndNumber(
    setCode: string,
    collectorNumber: string,
  ): Promise<PrintingCacheEntry | null> {
    const cacheKey = `${setCode.toLowerCase()}:${collectorNumber}`;
    const cached = this.printingCache.get(cacheKey);
    if (cached !== undefined) return cached;

    const rows = await this.dataSource.query(
      `SELECT tp.id, tp.token_name_id FROM token_printings tp
       JOIN sets s ON s.id = tp.set_id
       WHERE s.code = $1 AND tp.collector_number = $2
       LIMIT 1`,
      [setCode.toLowerCase(), collectorNumber],
    );

    if (rows.length > 0) {
      const entry: PrintingCacheEntry = {
        tokenPrintingId: Number(rows[0].id),
        tokenNameId: Number(rows[0].token_name_id),
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
