import { Client } from 'pg';
import Redis from 'ioredis';
import { PUBSUB_CHANNELS } from '@scoutlgs/shared';

const PLAYABLE_LAYOUTS = new Set([
  'normal',
  'split',
  'flip',
  'transform',
  'modal_dfc',
  'meld',
  'leveler',
  'class',
  'saga',
  'adventure',
  'mutate',
  'prototype',
  'battle',
  'case',
  'planar',
  'scheme',
  'vanguard',
  'phenomenon',
  'augment',
  'host',
]);

const TOKEN_LAYOUTS = new Set([
  'token',
  'double_faced_token',
  'emblem',
  'art_series',
]);

function parseTypeLine(typeLine: string): { supertype: string; cardType: string; subtypes: string } {
  const [typesPart, subtypesPart] = typeLine.split(/\s*—\s*/);
  const subtypes = subtypesPart?.trim() ?? '';
  const CARD_TYPES = ['Creature', 'Artifact', 'Enchantment', 'Land', 'Planeswalker', 'Instant', 'Sorcery', 'Emblem'];
  const words = (typesPart || '').split(/\s+/);
  let cardTypeIdx = -1;
  for (let i = 0; i < words.length; i++) {
    if (CARD_TYPES.includes(words[i])) {
      cardTypeIdx = i;
      break;
    }
  }
  if (cardTypeIdx >= 0) {
    return {
      supertype: words.slice(0, cardTypeIdx).join(' '),
      cardType: words.slice(cardTypeIdx).join(' '),
      subtypes,
    };
  }
  return { supertype: '', cardType: typesPart?.trim() ?? '', subtypes };
}

function normalizeCardName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"');
}

async function seedSet(setCode: string) {
  const client = new Client({
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432'),
    user: process.env.DATABASE_USER || 'postgres',
    password: process.env.DATABASE_PASSWORD || 'postgres',
    database: process.env.DATABASE_NAME || 'scoutlgs',
  });

  await client.connect();
  console.log(`Seeding set: ${setCode}`);

  try {
    // Fetch all cards for this set from Scryfall API (paginated)
    let url: string | null = `https://api.scryfall.com/cards/search?q=set:${encodeURIComponent(setCode)}&unique=prints`;
    const cards: any[] = [];

    while (url) {
      // Scryfall rate limit: 50-100ms between requests
      await new Promise((resolve) => setTimeout(resolve, 100));

      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 404) {
          console.log(`No cards found for set: ${setCode}`);
          return;
        }
        throw new Error(`Scryfall API error: ${res.status}`);
      }

      const data = (await res.json()) as { data: any[]; has_more: boolean; next_page?: string };
      cards.push(...data.data);
      url = data.has_more ? data.next_page! : null;
    }

    console.log(`Fetched ${cards.length} cards for set ${setCode}`);

    // Filter to playable layouts and tokens
    const playableCards = cards.filter(
      (c) => PLAYABLE_LAYOUTS.has(c.layout) && c.oracle_id,
    );
    const tokenCards = cards.filter(
      (c) => TOKEN_LAYOUTS.has(c.layout) && c.oracle_id,
    );
    console.log(`${playableCards.length} playable cards, ${tokenCards.length} tokens after filtering`);

    if (playableCards.length === 0 && tokenCards.length === 0) {
      console.log('No cards to seed.');
      return;
    }

    // Phase 1: Upsert unique card names
    const oracleMap = new Map<string, any>();
    for (const card of playableCards) {
      if (!oracleMap.has(card.oracle_id)) {
        oracleMap.set(card.oracle_id, card);
      }
    }

    const oracleCards = [...oracleMap.values()];
    if (oracleCards.length > 0) {
      const values: any[] = [];
      const placeholders = oracleCards.map((card, idx) => {
        const offset = idx * 3;
        values.push(
          card.oracle_id,
          card.name,
          normalizeCardName(card.name),
        );
        return `($${offset + 1}, $${offset + 2}, $${offset + 3})`;
      });

      const result = await client.query(
        `
        INSERT INTO card_names (oracle_id, name, normalized_name)
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (normalized_name) DO UPDATE SET
          oracle_id = EXCLUDED.oracle_id,
          name = EXCLUDED.name,
          updated_at = NOW()
      `,
        values,
      );
      console.log(`Upserted ${result.rowCount} card names`);
    }

    // Phase 2: Upsert printings
    if (playableCards.length > 0) {
      const values: any[] = [];
      const placeholders = playableCards.map((card, idx) => {
        const imageUri =
          card.image_uris?.normal || card.image_uris?.small || null;
        const offset = idx * 9;
        values.push(
          card.id,
          card.oracle_id,
          card.set,
          card.set_name,
          card.collector_number,
          card.rarity || null,
          imageUri,
          card.layout,
          card.digital || false,
        );
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9})`;
      });

      const result = await client.query(
        `
        INSERT INTO card_printings (card_name_id, scryfall_id, set_code, set_name, collector_number, rarity, image_uri, layout, digital)
        SELECT cn.id, v.scryfall_id, v.set_code, v.set_name, v.collector_number, v.rarity, v.image_uri, v.layout, v.digital
        FROM (VALUES ${placeholders.join(', ')}) AS v(scryfall_id, oracle_id, set_code, set_name, collector_number, rarity, image_uri, layout, digital)
        JOIN card_names cn ON cn.oracle_id = v.oracle_id::uuid
        ON CONFLICT (scryfall_id) DO UPDATE SET
          set_code = EXCLUDED.set_code,
          set_name = EXCLUDED.set_name,
          collector_number = EXCLUDED.collector_number,
          rarity = EXCLUDED.rarity,
          image_uri = EXCLUDED.image_uri,
          layout = EXCLUDED.layout,
          digital = EXCLUDED.digital,
          updated_at = NOW()
      `,
        values,
      );
      console.log(`Upserted ${result.rowCount} printings`);
    }

    // Phase 3: Upsert token names
    if (tokenCards.length > 0) {
      const tokenOracleMap = new Map<string, any>();
      for (const card of tokenCards) {
        if (!tokenOracleMap.has(card.oracle_id)) {
          tokenOracleMap.set(card.oracle_id, card);
        }
      }

      const uniqueTokens = [...tokenOracleMap.values()];
      if (uniqueTokens.length > 0) {
        const values: any[] = [];
        const placeholders = uniqueTokens.map((card, idx) => {
          const parsed = parseTypeLine(card.type_line || '');
          const offset = idx * 13;
          values.push(
            card.oracle_id,
            card.name,
            normalizeCardName(card.name),
            card.layout,
            card.type_line || null,
            parsed.supertype || null,
            parsed.cardType || null,
            parsed.subtypes || null,
            card.power || null,
            card.toughness || null,
            card.colors ? card.colors.join(',') : null,
            card.oracle_text || null,
            card.keywords ? card.keywords.join(',') : null,
          );
          return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13})`;
        });

        const result = await client.query(
          `
          INSERT INTO token_names (oracle_id, name, normalized_name, layout, type_line, supertype, card_type, subtypes, power, toughness, colors, oracle_text, keywords)
          VALUES ${placeholders.join(', ')}
          ON CONFLICT (oracle_id) DO UPDATE SET
            name = EXCLUDED.name,
            normalized_name = EXCLUDED.normalized_name,
            layout = EXCLUDED.layout,
            type_line = EXCLUDED.type_line,
            supertype = EXCLUDED.supertype,
            card_type = EXCLUDED.card_type,
            subtypes = EXCLUDED.subtypes,
            power = EXCLUDED.power,
            toughness = EXCLUDED.toughness,
            colors = EXCLUDED.colors,
            oracle_text = EXCLUDED.oracle_text,
            keywords = EXCLUDED.keywords,
            updated_at = NOW()
        `,
          values,
        );
        console.log(`Upserted ${result.rowCount} token names`);
      }

      // Phase 4: Upsert token printings
      const tokenValues: any[] = [];
      const tokenPlaceholders = tokenCards.map((card, idx) => {
        const imageUri =
          card.image_uris?.normal || card.image_uris?.small || null;
        const offset = idx * 7;
        tokenValues.push(
          card.id,
          card.oracle_id,
          card.set,
          card.collector_number,
          card.rarity || null,
          imageUri,
          card.layout,
        );
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`;
      });

      const tokenResult = await client.query(
        `
        INSERT INTO token_printings (token_name_id, scryfall_id, set_id, collector_number, rarity, image_uri, layout)
        SELECT tn.id, v.scryfall_id, s.id, v.collector_number, v.rarity, v.image_uri, v.layout
        FROM (VALUES ${tokenPlaceholders.join(', ')}) AS v(scryfall_id, oracle_id, set_code, collector_number, rarity, image_uri, layout)
        JOIN token_names tn ON tn.oracle_id = v.oracle_id::uuid
        JOIN sets s ON s.code = v.set_code
        ON CONFLICT (scryfall_id) DO UPDATE SET
          set_id = EXCLUDED.set_id,
          collector_number = EXCLUDED.collector_number,
          rarity = EXCLUDED.rarity,
          image_uri = EXCLUDED.image_uri,
          layout = EXCLUDED.layout,
          updated_at = NOW()
      `,
        tokenValues,
      );
      console.log(`Upserted ${tokenResult.rowCount} token printings`);
    }

    const printingCount = await client.query(
      `SELECT COUNT(*) FROM card_printings WHERE set_code = $1`,
      [setCode],
    );
    const tokenPrintingCount = await client.query(
      `SELECT COUNT(*) FROM token_printings tp JOIN sets s ON s.id = tp.set_id WHERE s.code = $1`,
      [setCode],
    );
    console.log(
      `\nSet ${setCode} complete: ${printingCount.rows[0].count} printings, ${tokenPrintingCount.rows[0].count} token printings`,
    );

    await notifyCardDataChanged(setCode);
  } finally {
    await client.end();
  }
}

async function notifyCardDataChanged(setCode: string): Promise<void> {
  const pub = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  try {
    await pub.connect();
    await pub.publish(PUBSUB_CHANNELS.CARD_DATA_CHANGED, `set:${setCode}`);
    console.log(`Published cache-invalidation on ${PUBSUB_CHANNELS.CARD_DATA_CHANGED}`);
  } catch (err) {
    console.warn('Failed to publish cache-invalidation (scrapers will need a manual restart):', err);
  } finally {
    pub.disconnect();
  }
}

const setCode = process.argv[2];
if (!setCode) {
  console.error('Usage: seed-scryfall-set <SET_CODE>');
  console.error('Example: seed-scryfall-set MH3');
  process.exit(1);
}

seedSet(setCode).catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
