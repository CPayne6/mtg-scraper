import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Condition } from '@scoutlgs/shared';
import type { CardOptimizationJobData, CardWithStore } from '@scoutlgs/shared';
import { normalizeCondition, optimizeCart } from '../cart-optimizer/cart-optimizer';
import type { CartOptimizationCandidate, CartOptimizationResult, CartOptimizationWantedCard } from '../cart-optimizer/cart-optimizer.types';

interface EntryRow { position: string; card_name_id: string; card_name: string; preferred_set_code: string | null }
interface CandidateRow {
  wanted_position: string; card_name_id: string; variant_id: string; platform_variant_id: string | null; price: string;
  foil: boolean; condition_code: string; currency: string; image_url: string | null;
  store_slug: string; store_display_name: string; store_base_url: string; product_handle: string | null;
  scryfall_id: string | null; collector_number: string | null; image_uri: string | null;
  set_code: string | null; set_name: string | null;
}

export interface CardOptimizationExecutionResult {
  id: string;
  name: string;
  generatedAt: number;
  result: CartOptimizationResult;
  metrics: { databaseQueryMs: number; candidateCount: number; subsetsEvaluated: number; optimizationMs: number; timedOut: boolean };
}

@Injectable()
export class CardOptimizationService {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(data: CardOptimizationJobData): Promise<CardOptimizationExecutionResult> {
    const queryStarted = Date.now();
    const entries: EntryRow[] = await this.entityManager.query(`
      SELECT e.position, e.card_name_id, cn.name AS card_name, e.preferred_set_code
      FROM card_list_entries e JOIN card_names cn ON cn.id = e.card_name_id
      WHERE e.card_list_id = $1 ORDER BY e.position ASC LIMIT 150`, [data.listId]);
    const ids = [...new Set(entries.map((entry) => Number(entry.card_name_id)))];
    const conditions = this.eligibleConditions(
      normalizeCondition(data.minimumCondition),
      data.conditionFlexibility,
      data.maxDowngradeSteps,
    );
    const candidates: CandidateRow[] = ids.length ? await this.entityManager.query(`
      WITH ranked AS (
        SELECT e.position AS wanted_position, l.card_name_id, v.id AS variant_id, v.platform_variant_id, v.price, v.foil,
          c.code AS condition_code, l.currency, l.image_url, s.name AS store_slug,
          s.display_name AS store_display_name, s.base_url AS store_base_url, pu.handle AS product_handle,
          p.scryfall_id, p.collector_number, p.image_uri, ps.code AS set_code, ps.name AS set_name,
          ROW_NUMBER() OVER (PARTITION BY e.position, s.name ORDER BY v.price ASC, v.id ASC) AS price_rank
        FROM card_list_entries e JOIN card_listings l ON l.card_name_id = e.card_name_id
        JOIN card_variants v ON v.card_listing_id = l.id
        JOIN stores s ON s.id = l.store_id JOIN card_conditions c ON c.id = v.condition_id
        LEFT JOIN product_urls pu ON pu.id = l.product_url_id LEFT JOIN card_printings p ON p.id = l.card_printing_id
        LEFT JOIN sets ps ON ps.id = p.set_id
        WHERE e.card_list_id = $4 AND l.card_name_id = ANY($1::int[]) AND ($2::text[] IS NULL OR s.name = ANY($2))
          AND c.code = ANY($3::text[]) AND v.in_stock = TRUE
          AND (e.preferred_set_code IS NULL OR lower(e.preferred_set_code) = lower(COALESCE(ps.code, '')))
      ) SELECT * FROM ranked WHERE price_rank = 1 ORDER BY card_name_id, store_slug`,
      [ids, data.stores, conditions, data.listId]) : [];
    const databaseQueryMs = Date.now() - queryStarted;
    const byPosition = new Map<string, CandidateRow[]>();
    for (const row of candidates) byPosition.set(row.wanted_position, [...(byPosition.get(row.wanted_position) ?? []), row]);
    const wantedCards: CartOptimizationWantedCard[] = entries.map((entry) => ({
      key: String(entry.position), name: entry.card_name, minimumCondition: normalizeCondition(data.minimumCondition),
      preferredSetCode: entry.preferred_set_code ?? undefined,
      setPreference: entry.preferred_set_code ? 'required' : 'any',
    }));
    const mapped: CartOptimizationCandidate[] = entries.flatMap((entry) =>
      (byPosition.get(entry.position) ?? []).map((row) => ({
        wantedCardKey: String(entry.position), offer: this.offer(row, entry.card_name),
        setCode: row.set_code ?? undefined, setName: row.set_name ?? undefined,
      })));
    const optimizationStarted = Date.now();
    const result = optimizeCart({ wantedCards, candidates: mapped, options: {
      defaultMinimumCondition: normalizeCondition(data.minimumCondition), defaultShippingCost: 3,
      timeBudgetMs: 60_000,
      conditionFlexibility: { mode: data.conditionFlexibility ?? 'strict', maxDowngradeSteps: data.maxDowngradeSteps,
        downgradePenaltyPerStep: data.downgradePenaltyPerStep },
    }});
    const optimizationMs = Date.now() - optimizationStarted;
    return { id: data.listUuid, name: data.listName, generatedAt: Date.now(), result,
      metrics: { databaseQueryMs, candidateCount: mapped.length, subsetsEvaluated: result.subsetsEvaluated,
        optimizationMs, timedOut: !result.optimal } };
  }

  private conditionsAtOrAbove(minimum: Condition): string[] {
    const order = [Condition.DMG, Condition.HP, Condition.MP, Condition.LP, Condition.NM];
    return order.slice(Math.max(0, order.indexOf(minimum)));
  }

  private eligibleConditions(
    minimum: Condition,
    mode: CardOptimizationJobData['conditionFlexibility'],
    maxDowngradeSteps?: number,
  ): string[] {
    if (!mode || mode === 'strict') return this.conditionsAtOrAbove(minimum);
    const descending = [Condition.NM, Condition.LP, Condition.MP, Condition.HP, Condition.DMG];
    const minimumIndex = Math.max(0, descending.indexOf(minimum));
    return descending.slice(0, Math.min(descending.length, minimumIndex + 1 + (maxDowngradeSteps ?? 4)));
  }

  private offer(row: CandidateRow, name: string): CardWithStore {
    return { id: Number(row.variant_id), price: Number(row.price), condition: normalizeCondition(row.condition_code),
      foil: row.foil, image: row.image_url ?? row.image_uri ?? '', title: `${name}${row.set_name ? ` [${row.set_name}]` : ''}`,
      currency: row.currency, link: row.product_handle ? `${row.store_base_url}/products/${row.product_handle}` : row.store_base_url,
      set: row.set_name ?? '', card_number: row.collector_number ?? '', scryfall_id: row.scryfall_id ?? undefined,
      variant_id: row.platform_variant_id ?? undefined, store: row.store_display_name, store_key: row.store_slug };
  }
}
