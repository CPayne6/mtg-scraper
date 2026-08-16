import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CacheService, QueueService } from '@scoutlgs/core';

const PLAYABLE_LAYOUTS = new Set([
  'normal', 'split', 'flip', 'transform', 'modal_dfc', 'meld', 'leveler',
  'class', 'saga', 'adventure', 'mutate', 'prototype', 'battle', 'case',
  'planar', 'scheme', 'vanguard', 'phenomenon', 'augment', 'host',
]);
const EXCLUDED_SET_TYPES = new Set(['token', 'art_series', 'memorabilia', 'minigame', 'treasure_chest']);
const SCRYFALL_HEADERS = {
  'User-Agent': 'ScoutLGS/1.0 (https://github.com/CPayne6/mtg-scraper)',
  Accept: 'application/json',
};

type ScryfallSet = { code: string; name: string; released_at?: string; digital?: boolean; set_type: string };
type ScryfallCard = {
  id: string; oracle_id?: string; name: string; set: string; set_name: string;
  collector_number: string; rarity?: string; layout: string;
  image_uris?: { normal?: string; small?: string };
};

function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
}

@Injectable()
export class ScryfallCatalogService {
  private readonly logger = new Logger(ScryfallCatalogService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly queueService: QueueService,
    private readonly cacheService: CacheService,
  ) {}

  async syncMissingSets(): Promise<string[]> {
    const response = await fetch('https://api.scryfall.com/sets', { headers: SCRYFALL_HEADERS });
    if (!response.ok) throw new Error(`Scryfall set catalog request failed (${response.status})`);
    const body = await response.json() as { data?: ScryfallSet[] };
    const today = new Date().toISOString().slice(0, 10);
    const candidates = (body.data ?? []).filter((set) =>
      !set.digital && !EXCLUDED_SET_TYPES.has(set.set_type) && Boolean(set.released_at) && set.released_at! <= today,
    );
    const tracked = await this.dataSource.query<Array<{ code: string }>>('SELECT code FROM sets');
    const trackedCodes = new Set(tracked.map((row) => row.code.toLowerCase()));
    const missing = candidates.filter((set) => !trackedCodes.has(set.code.toLowerCase()));

    for (const set of missing) await this.importSet(set);
    if (missing.length) {
      const setCodes = missing.map((set) => set.code.toLowerCase());
      // Scrapers rebuild their in-memory name, set, and printing caches on
      // this event, before they consume the targeted re-match jobs below.
      await this.cacheService.publishCardDataChanged(`sets:${setCodes.join(',')}`);
      await this.queueUnmatchedRematches(setCodes);
      this.logger.log(
        `Imported ${missing.length} new Scryfall set(s): ${setCodes.join(', ')}; queued unmatched-card re-matches`,
      );
    }
    else this.logger.log('Scryfall set check found no new sets');
    return missing.map((set) => set.code);
  }

  private async queueUnmatchedRematches(setCodes: string[]): Promise<void> {
    const stores = await this.dataSource.query<Array<{ id: number }>>(
      `SELECT DISTINCT s.id
       FROM stores s
       JOIN shopify_products sp ON sp.store_id = s.id
       LEFT JOIN unmatched_cards uc
         ON uc.store_id = sp.store_id AND uc.product_url_id = sp.product_url_id
       LEFT JOIN card_listings cl
         ON cl.id = sp.card_listing_id
         OR (cl.store_id = sp.store_id AND cl.product_url_id = sp.product_url_id)
       WHERE s.platform_type = 'shopify_storefront'
         AND (
           LOWER(uc.set_code) = ANY($1::text[])
           OR (sp.card_listing_id IS NOT NULL AND cl.card_printing_id IS NULL)
         )`,
      [setCodes],
    );
    await Promise.all(stores.map((store) =>
      this.queueService.enqueueReextractUnmatchedJob({
        storeId: Number(store.id),
        setCodes,
        rematchMissingPrintings: true,
        // Give Redis subscribers time to finish rebuilding their caches.
        delayMs: 10_000,
      }),
    ));
    this.logger.log(`Queued unmatched-card re-matches for ${stores.length} store(s)`);
  }

  private async importSet(set: ScryfallSet): Promise<void> {
    const cards: ScryfallCard[] = [];
    let url: string | null = `https://api.scryfall.com/cards/search?q=set:${encodeURIComponent(set.code)}&unique=prints`;
    while (url) {
      const response = await fetch(url, { headers: SCRYFALL_HEADERS });
      if (!response.ok) throw new Error(`Scryfall cards request for ${set.code} failed (${response.status})`);
      const body = await response.json() as { data?: ScryfallCard[]; has_more?: boolean; next_page?: string };
      cards.push(...(body.data ?? []).filter((card) => card.oracle_id && PLAYABLE_LAYOUTS.has(card.layout)));
      url = body.has_more ? body.next_page ?? null : null;
    }

    await this.dataSource.transaction(async (manager) => {
      const [storedSet] = await manager.query<Array<{ id: number }>>(
        `INSERT INTO sets (code, name) VALUES ($1, $2)
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`, [set.code.toLowerCase(), set.name],
      );
      for (const card of cards) {
        const [cardName] = await manager.query<Array<{ id: number }>>(
          `INSERT INTO card_names (oracle_id, name, normalized_name)
           VALUES ($1, $2, $3)
           ON CONFLICT (normalized_name) DO UPDATE SET oracle_id = EXCLUDED.oracle_id, name = EXCLUDED.name, updated_at = NOW()
           RETURNING id`, [card.oracle_id, card.name, normalizeName(card.name)],
        );
        await manager.query(
          `INSERT INTO card_printings (card_name_id, scryfall_id, set_id, collector_number, rarity, image_uri, layout)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (scryfall_id) DO UPDATE SET card_name_id = EXCLUDED.card_name_id, set_id = EXCLUDED.set_id,
             collector_number = EXCLUDED.collector_number, rarity = EXCLUDED.rarity, image_uri = EXCLUDED.image_uri, layout = EXCLUDED.layout, updated_at = NOW()`,
          [cardName.id, card.id, storedSet.id, card.collector_number, card.rarity ?? null, card.image_uris?.normal ?? card.image_uris?.small ?? null, card.layout],
        );
      }
    });
  }
}
