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

    const normalizedEntries = names.map((name) => ({
      original: name,
      normalized: this.normalizeCardName(name),
    }));

    // Step 1: Batch exact match via IN query
    const normalizedNames = [...new Set(normalizedEntries.map((e) => e.normalized))];
    const exactMatches = normalizedNames.length > 0
      ? await this.cardNameRepository.find({
          where: { normalizedName: In(normalizedNames) },
        })
      : [];

    const exactMap = new Map<string, CardName>();
    for (const match of exactMatches) {
      exactMap.set(match.normalizedName, match);
    }

    // Step 2: Preserve the user's input order and multiplicity.
    const fuzzyMap = new Map<string, CardName | null>();
    for (const { normalized, original } of normalizedEntries) {
      const exact = exactMap.get(normalized);
      if (exact) {
        resolved.push({
          input: original,
          cardNameId: exact.id,
          resolvedName: exact.name,
          fuzzy: false,
        });
        continue;
      }

      let match = fuzzyMap.get(normalized);
      if (!fuzzyMap.has(normalized)) {
        match = await this.findCardNameByFuzzyMatch(original);
        fuzzyMap.set(normalized, match);
      }
      if (match) {
        resolved.push({
          input: original,
          cardNameId: match.id,
          resolvedName: match.name,
          fuzzy: true,
        });
      } else {
        unresolved.push(original);
      }
    }

    return { resolved, unresolved };
  }
}
