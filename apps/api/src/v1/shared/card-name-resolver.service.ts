import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { CardName } from '@scoutlgs/core';

export interface ResolvedCardName {
  input: string;
  cardNameId: number;
  resolvedName: string;
  fuzzy: boolean;
}

export interface CardNameResolutionResult {
  resolved: ResolvedCardName[];
  unresolved: string[];
}

@Injectable()
export class CardNameResolverService {
  private readonly logger = new Logger(CardNameResolverService.name);

  constructor(
    @InjectRepository(CardName)
    private readonly cardNameRepository: Repository<CardName>,
  ) {}

  normalizeCardName(name: string): string {
    return name
      .toLowerCase()
      .replace(/\[.*?\]/g, '')
      .replace(/\s*\([^)]*\)\s*/g, ' ')
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/['']/g, "'")
      .replace(/[""]/g, '"');
  }

  async findCardNameByFuzzyMatch(name: string): Promise<CardName | null> {
    const results = await this.cardNameRepository
      .createQueryBuilder('cn')
      .where(`similarity(cn.name, :name) > 0.3`, { name })
      .orderBy(`similarity(cn.name, :name)`, 'DESC')
      .limit(1)
      .getMany();

    return results[0] ?? null;
  }

  async resolveCardNames(names: string[]): Promise<CardNameResolutionResult> {
    const resolved: ResolvedCardName[] = [];
    const unresolved: string[] = [];

    // Deduplicate and normalize
    const uniqueEntries = new Map<string, string>(); // normalized -> original
    for (const name of names) {
      const normalized = this.normalizeCardName(name);
      if (!uniqueEntries.has(normalized)) {
        uniqueEntries.set(normalized, name);
      }
    }

    // Step 1: Batch exact match via IN query
    const normalizedNames = [...uniqueEntries.keys()];
    const exactMatches = normalizedNames.length > 0
      ? await this.cardNameRepository.find({
          where: { normalizedName: In(normalizedNames) },
        })
      : [];

    const exactMap = new Map<string, CardName>();
    for (const match of exactMatches) {
      exactMap.set(match.normalizedName, match);
    }

    // Step 2: Fuzzy match only for misses
    const fuzzyNeeded: string[] = [];
    for (const [normalized, original] of uniqueEntries) {
      const exact = exactMap.get(normalized);
      if (exact) {
        resolved.push({
          input: original,
          cardNameId: exact.id,
          resolvedName: exact.name,
          fuzzy: false,
        });
      } else {
        fuzzyNeeded.push(original);
      }
    }

    for (const name of fuzzyNeeded) {
      const match = await this.findCardNameByFuzzyMatch(name);
      if (match) {
        resolved.push({
          input: name,
          cardNameId: match.id,
          resolvedName: match.name,
          fuzzy: true,
        });
      } else {
        unresolved.push(name);
      }
    }

    return { resolved, unresolved };
  }
}
