import { Client } from 'pg';
import { from as copyFrom } from 'pg-copy-streams';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { parser } from 'stream-json';
import { streamArray } from 'stream-json/streamers/StreamArray';
import { chain } from 'stream-chain';
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

/**
 * Parse a Scryfall type_line into supertype, card_type, and subtypes.
 * e.g. "Token Creature — Soldier" → { supertype: "Token", cardType: "Creature", subtypes: "Soldier" }
 * e.g. "Token Legendary Creature — Angel" → { supertype: "Token Legendary", cardType: "Creature", subtypes: "Angel" }
 * e.g. "Token Artifact — Food" → { supertype: "Token", cardType: "Artifact", subtypes: "Food" }
 */
function parseTypeLine(typeLine: string): { supertype: string; cardType: string; subtypes: string } {
  // Split on em-dash (—) to separate type from subtypes
  const [typesPart, subtypesPart] = typeLine.split(/\s*—\s*/);
  const subtypes = subtypesPart?.trim() ?? '';

  // Known card types
  const CARD_TYPES = ['Creature', 'Artifact', 'Enchantment', 'Land', 'Planeswalker', 'Instant', 'Sorcery', 'Emblem'];
  const words = (typesPart || '').split(/\s+/);

  // Find the first known card type word
  let cardTypeIdx = -1;
  for (let i = 0; i < words.length; i++) {
    if (CARD_TYPES.includes(words[i])) {
      cardTypeIdx = i;
      break;
    }
  }

  if (cardTypeIdx >= 0) {
    const supertype = words.slice(0, cardTypeIdx).join(' ');
    const cardType = words.slice(cardTypeIdx).join(' ');
    return { supertype, cardType, subtypes };
  }

  // No recognized card type — put everything in cardType
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

function normalizeColorIdentity(colors: unknown): string {
  const values = Array.isArray(colors) ? colors : [];
  return 'WUBRG'.split('').filter((color) => values.includes(color)).join('');
}
const SCRYFALL_HEADERS = { 'User-Agent': 'ScoutLGS/1.0 (https://github.com/CPayne6/mtg-scraper)', Accept: 'application/json' };

/**
 * Escape a value for COPY tab-delimited format.
 * NULL → \N, tabs/newlines/backslashes escaped.
 */
function copyEscape(value: unknown): string {
  if (value === null || value === undefined) return '\\N';
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\t/g, '\\t')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

async function getDownloadUrl(bulkType: string): Promise<string> {
  const res = await fetch(`https://api.scryfall.com/bulk-data/${bulkType}`, { headers: SCRYFALL_HEADERS });
  if (!res.ok)
    throw new Error(`Failed to fetch bulk data info: ${res.status}`);
  const data = (await res.json()) as { download_uri: string };
  return data.download_uri;
}

async function seedScryfall() {
  const client = new Client({
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432'),
    user: process.env.DATABASE_USER || 'postgres',
    password: process.env.DATABASE_PASSWORD || 'postgres',
    database: process.env.DATABASE_NAME || 'scoutlgs',
  });

  await client.connect();
  console.log('Connected to database');

  try {
    // ===== Phase 1: Oracle Cards -> card_names table =====
    console.log('Fetching Oracle Cards bulk data URL...');
    const oracleUrl = await getDownloadUrl('oracle-cards');
    console.log(`Downloading from: ${oracleUrl}`);

    // Create staging table for oracle cards
    await client.query(`
      CREATE TEMP TABLE staging_cards (
        oracle_id uuid,
        name text,
        normalized_name text,
        color_identity varchar(5)
      )
    `);

    // Stream and collect oracle cards
    const oracleCards: any[] = [];
    const oracleRes = await fetch(oracleUrl, { headers: SCRYFALL_HEADERS });
    if (!oracleRes.ok || !oracleRes.body)
      throw new Error('Failed to download oracle cards');

    const oracleStream = chain([
      Readable.fromWeb(oracleRes.body as any),
      parser(),
      streamArray(),
    ]);

    const oracleTokens: any[] = [];

    for await (const { value: card } of oracleStream) {
      if (PLAYABLE_LAYOUTS.has(card.layout)) {
        oracleCards.push({
          oracle_id: card.oracle_id,
          name: card.name,
          normalized_name: normalizeCardName(card.name),
          color_identity: normalizeColorIdentity(card.color_identity),
        });
      } else if (TOKEN_LAYOUTS.has(card.layout)) {
        const parsed = parseTypeLine(card.type_line || '');
        oracleTokens.push({
          oracle_id: card.oracle_id,
          name: card.name,
          normalized_name: normalizeCardName(card.name),
          layout: card.layout,
          type_line: card.type_line || null,
          supertype: parsed.supertype || null,
          card_type: parsed.cardType || null,
          subtypes: parsed.subtypes || null,
          power: card.power || null,
          toughness: card.toughness || null,
          colors: card.colors ? card.colors.join(',') : null,
          oracle_text: card.oracle_text || null,
          keywords: card.keywords ? card.keywords.join(',') : null,
        });
      }
    }

    console.log(`Collected ${oracleCards.length} oracle cards, ${oracleTokens.length} oracle tokens`);

    // COPY into staging table
    console.log('COPY oracle cards into staging table...');
    const oracleCopyStream = client.query(
      copyFrom(
        `COPY staging_cards (oracle_id, name, normalized_name, color_identity) FROM STDIN`,
      ),
    );

    const oracleReadable = Readable.from(
      oracleCards.map((card) =>
        [
          copyEscape(card.oracle_id),
          copyEscape(card.name),
          copyEscape(card.normalized_name),
          copyEscape(card.color_identity),
        ].join('\t') + '\n',
      ),
    );

    await pipeline(oracleReadable, oracleCopyStream);
    console.log(`  COPY complete: ${oracleCards.length} rows`);

    // Upsert from staging into card_names
    // DISTINCT ON dedupes by normalized_name — Scryfall sometimes has multiple
    // oracle_ids that normalize to the same name (e.g. art variants).
    const cardResult = await client.query(`
      WITH unique_cards AS (
        SELECT DISTINCT ON (normalized_name) oracle_id, name, normalized_name, color_identity
        FROM staging_cards
        ORDER BY normalized_name, oracle_id
      )
      UPDATE card_names cn
      SET color_identity = sc.color_identity, updated_at = NOW()
      FROM unique_cards sc
      WHERE cn.normalized_name = sc.normalized_name OR cn.oracle_id = sc.oracle_id
    `);
    await client.query(`
      INSERT INTO card_names (oracle_id, name, normalized_name, color_identity)
      SELECT sc.oracle_id, sc.name, sc.normalized_name, sc.color_identity
      FROM (SELECT DISTINCT ON (normalized_name) oracle_id, name, normalized_name, color_identity FROM staging_cards ORDER BY normalized_name, oracle_id) sc
      LEFT JOIN card_names cn ON cn.normalized_name = sc.normalized_name OR cn.oracle_id = sc.oracle_id
      WHERE cn.id IS NULL
      ON CONFLICT DO NOTHING
    `);
    console.log(`Upserted ${cardResult.rowCount} card names`);

    await client.query('DROP TABLE IF EXISTS staging_cards');

    // ===== Phase 1b: Oracle Tokens -> token_names table =====
    if (oracleTokens.length > 0) {
      console.log('\nSeeding token_names table...');
      await client.query(`
        CREATE TEMP TABLE staging_tokens (
          oracle_id uuid,
          name text,
          normalized_name text,
          layout text,
          type_line text,
          supertype text,
          card_type text,
          subtypes text,
          power text,
          toughness text,
          colors text,
          oracle_text text,
          keywords text
        )
      `);

      const tokenCopyStream = client.query(
        copyFrom(
          `COPY staging_tokens (oracle_id, name, normalized_name, layout, type_line, supertype, card_type, subtypes, power, toughness, colors, oracle_text, keywords) FROM STDIN`,
        ),
      );

      const tokenReadable = Readable.from(
        oracleTokens.map((t) =>
          [
            copyEscape(t.oracle_id),
            copyEscape(t.name),
            copyEscape(t.normalized_name),
            copyEscape(t.layout),
            copyEscape(t.type_line),
            copyEscape(t.supertype),
            copyEscape(t.card_type),
            copyEscape(t.subtypes),
            copyEscape(t.power),
            copyEscape(t.toughness),
            copyEscape(t.colors),
            copyEscape(t.oracle_text),
            copyEscape(t.keywords),
          ].join('\t') + '\n',
        ),
      );

      await pipeline(tokenReadable, tokenCopyStream);
      console.log(`  COPY complete: ${oracleTokens.length} token rows`);

      const tokenResult = await client.query(`
        INSERT INTO token_names (oracle_id, name, normalized_name, layout, type_line, supertype, card_type, subtypes, power, toughness, colors, oracle_text, keywords)
        SELECT oracle_id, name, normalized_name, layout, type_line, supertype, card_type, subtypes, power, toughness, colors, oracle_text, keywords
        FROM staging_tokens
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
      `);
      console.log(`Upserted ${tokenResult.rowCount} token names`);

      await client.query('DROP TABLE IF EXISTS staging_tokens');
    }

    // ===== Phase 2: Default Cards -> sets + card_printings tables =====
    console.log('\nFetching Default Cards bulk data URL...');
    const defaultUrl = await getDownloadUrl('default-cards');
    console.log(`Downloading from: ${defaultUrl}`);

    // Collect sets and printings (filtering out digital)
    const setsMap = new Map<string, string>(); // code → name
    const printings: any[] = [];
    const tokenPrintings: any[] = [];

    const defaultRes = await fetch(defaultUrl);
    if (!defaultRes.ok || !defaultRes.body)
      throw new Error('Failed to download default cards');

    const defaultStream = chain([
      Readable.fromWeb(defaultRes.body as any),
      parser(),
      streamArray(),
    ]);

    for await (const { value: card } of defaultStream) {
      if (!card.oracle_id) continue;
      if (card.digital) continue; // Skip digital-only printings

      // Collect unique sets (from both cards and tokens)
      if (PLAYABLE_LAYOUTS.has(card.layout) || TOKEN_LAYOUTS.has(card.layout)) {
        if (!setsMap.has(card.set)) {
          setsMap.set(card.set, card.set_name);
        }
      }

      const imageUri =
        card.image_uris?.normal || card.image_uris?.small || null;

      if (PLAYABLE_LAYOUTS.has(card.layout)) {
        printings.push({
          scryfall_id: card.id,
          oracle_id: card.oracle_id,
          set_code: card.set,
          collector_number: card.collector_number,
          rarity: card.rarity || null,
          image_uri: imageUri,
          layout: card.layout,
        });
      } else if (TOKEN_LAYOUTS.has(card.layout)) {
        tokenPrintings.push({
          scryfall_id: card.id,
          oracle_id: card.oracle_id,
          set_code: card.set,
          collector_number: card.collector_number,
          rarity: card.rarity || null,
          image_uri: imageUri,
          layout: card.layout,
        });
      }
    }

    console.log(`Collected ${setsMap.size} sets, ${printings.length} printings, ${tokenPrintings.length} token printings (digital filtered out)`);

    // ===== Phase 2a: Seed sets table =====
    console.log('Seeding sets table...');
    await client.query(`
      CREATE TEMP TABLE staging_sets (
        code text,
        name text
      )
    `);

    const setsCopyStream = client.query(
      copyFrom(`COPY staging_sets (code, name) FROM STDIN`),
    );

    const setsReadable = Readable.from(
      Array.from(setsMap.entries()).map(([code, name]) =>
        [copyEscape(code), copyEscape(name)].join('\t') + '\n',
      ),
    );

    await pipeline(setsReadable, setsCopyStream);

    const setsResult = await client.query(`
      INSERT INTO sets (code, name)
      SELECT code, name FROM staging_sets
      ON CONFLICT (code) DO UPDATE SET
        name = EXCLUDED.name,
        updated_at = NOW()
    `);
    console.log(`Upserted ${setsResult.rowCount} sets`);

    await client.query('DROP TABLE IF EXISTS staging_sets');

    // ===== Phase 2b: Seed card_printings table =====
    console.log('Seeding card_printings table...');
    await client.query(`
      CREATE TEMP TABLE staging_printings (
        scryfall_id uuid,
        oracle_id uuid,
        set_code text,
        collector_number text,
        rarity text,
        image_uri text,
        layout text
      )
    `);

    console.log('COPY printings into staging table...');
    const printingCopyStream = client.query(
      copyFrom(
        `COPY staging_printings (scryfall_id, oracle_id, set_code, collector_number, rarity, image_uri, layout) FROM STDIN`,
      ),
    );

    const printingReadable = Readable.from(
      printings.map((p) =>
        [
          copyEscape(p.scryfall_id),
          copyEscape(p.oracle_id),
          copyEscape(p.set_code),
          copyEscape(p.collector_number),
          copyEscape(p.rarity),
          copyEscape(p.image_uri),
          copyEscape(p.layout),
        ].join('\t') + '\n',
      ),
    );

    await pipeline(printingReadable, printingCopyStream);
    console.log(`  COPY complete: ${printings.length} rows`);

    // Upsert from staging into card_printings (JOIN card_names for card_name_id, JOIN sets for set_id)
    const printingResult = await client.query(`
      INSERT INTO card_printings (card_name_id, scryfall_id, set_id, collector_number, rarity, image_uri, layout)
      SELECT cn.id, sp.scryfall_id, s.id, sp.collector_number, sp.rarity, sp.image_uri, sp.layout
      FROM staging_printings sp
      JOIN card_names cn ON cn.oracle_id = sp.oracle_id
      JOIN sets s ON s.code = sp.set_code
      ON CONFLICT (scryfall_id) DO UPDATE SET
        set_id = EXCLUDED.set_id,
        collector_number = EXCLUDED.collector_number,
        rarity = EXCLUDED.rarity,
        image_uri = EXCLUDED.image_uri,
        layout = EXCLUDED.layout,
        updated_at = NOW()
    `);
    console.log(`Upserted ${printingResult.rowCount} printings`);

    await client.query('DROP TABLE IF EXISTS staging_printings');

    // ===== Phase 2c: Seed token_printings table =====
    if (tokenPrintings.length > 0) {
      console.log('\nSeeding token_printings table...');
      await client.query(`
        CREATE TEMP TABLE staging_token_printings (
          scryfall_id uuid,
          oracle_id uuid,
          set_code text,
          collector_number text,
          rarity text,
          image_uri text,
          layout text
        )
      `);

      console.log('COPY token printings into staging table...');
      const tokenPrintingCopyStream = client.query(
        copyFrom(
          `COPY staging_token_printings (scryfall_id, oracle_id, set_code, collector_number, rarity, image_uri, layout) FROM STDIN`,
        ),
      );

      const tokenPrintingReadable = Readable.from(
        tokenPrintings.map((p) =>
          [
            copyEscape(p.scryfall_id),
            copyEscape(p.oracle_id),
            copyEscape(p.set_code),
            copyEscape(p.collector_number),
            copyEscape(p.rarity),
            copyEscape(p.image_uri),
            copyEscape(p.layout),
          ].join('\t') + '\n',
        ),
      );

      await pipeline(tokenPrintingReadable, tokenPrintingCopyStream);
      console.log(`  COPY complete: ${tokenPrintings.length} token printing rows`);

      const tokenPrintingResult = await client.query(`
        INSERT INTO token_printings (token_name_id, scryfall_id, set_id, collector_number, rarity, image_uri, layout)
        SELECT tn.id, sp.scryfall_id, s.id, sp.collector_number, sp.rarity, sp.image_uri, sp.layout
        FROM staging_token_printings sp
        JOIN token_names tn ON tn.oracle_id = sp.oracle_id
        JOIN sets s ON s.code = sp.set_code
        ON CONFLICT (scryfall_id) DO UPDATE SET
          set_id = EXCLUDED.set_id,
          collector_number = EXCLUDED.collector_number,
          rarity = EXCLUDED.rarity,
          image_uri = EXCLUDED.image_uri,
          layout = EXCLUDED.layout,
          updated_at = NOW()
      `);
      console.log(`Upserted ${tokenPrintingResult.rowCount} token printings`);

      await client.query('DROP TABLE IF EXISTS staging_token_printings');
    }

    // Summary
    const cardNameCount = await client.query('SELECT COUNT(*) FROM card_names');
    const setCount = await client.query('SELECT COUNT(*) FROM sets');
    const printingCount = await client.query(
      'SELECT COUNT(*) FROM card_printings',
    );
    const tokenNameCount = await client.query('SELECT COUNT(*) FROM token_names');
    const tokenPrintingCount = await client.query('SELECT COUNT(*) FROM token_printings');
    console.log(`\nSeed complete!`);
    console.log(`  Card Names: ${cardNameCount.rows[0].count}`);
    console.log(`  Sets: ${setCount.rows[0].count}`);
    console.log(`  Printings: ${printingCount.rows[0].count}`);
    console.log(`  Token Names: ${tokenNameCount.rows[0].count}`);
    console.log(`  Token Printings: ${tokenPrintingCount.rows[0].count}`);

    await notifyCardDataChanged();
  } finally {
    await client.end();
  }
}

async function notifyCardDataChanged(): Promise<void> {
  const pub = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  try {
    await pub.connect();
    await pub.publish(PUBSUB_CHANNELS.CARD_DATA_CHANGED, 'all');
    console.log(`Published cache-invalidation on ${PUBSUB_CHANNELS.CARD_DATA_CHANGED}`);
  } catch (err) {
    console.warn('Failed to publish cache-invalidation (scrapers will need a manual restart):', err);
  } finally {
    pub.disconnect();
  }
}

seedScryfall().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
