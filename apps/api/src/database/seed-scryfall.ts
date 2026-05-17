import { Client } from 'pg';
import { from as copyFrom } from 'pg-copy-streams';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { parser } from 'stream-json';
import { streamArray } from 'stream-json/streamers/StreamArray';
import { chain } from 'stream-chain';

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

function normalizeCardName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"');
}

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
  const res = await fetch(
    `https://api.scryfall.com/bulk-data/${bulkType}`,
  );
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
        normalized_name text
      )
    `);

    // Stream and collect oracle cards
    const oracleCards: any[] = [];
    const oracleRes = await fetch(oracleUrl);
    if (!oracleRes.ok || !oracleRes.body)
      throw new Error('Failed to download oracle cards');

    const oracleStream = chain([
      Readable.fromWeb(oracleRes.body as any),
      parser(),
      streamArray(),
    ]);

    for await (const { value: card } of oracleStream) {
      if (!PLAYABLE_LAYOUTS.has(card.layout)) continue;
      oracleCards.push({
        oracle_id: card.oracle_id,
        name: card.name,
        normalized_name: normalizeCardName(card.name),
      });
    }

    console.log(`Collected ${oracleCards.length} oracle cards`);

    // COPY into staging table
    console.log('COPY oracle cards into staging table...');
    const oracleCopyStream = client.query(
      copyFrom(
        `COPY staging_cards (oracle_id, name, normalized_name) FROM STDIN`,
      ),
    );

    const oracleReadable = Readable.from(
      oracleCards.map((card) =>
        [
          copyEscape(card.oracle_id),
          copyEscape(card.name),
          copyEscape(card.normalized_name),
        ].join('\t') + '\n',
      ),
    );

    await pipeline(oracleReadable, oracleCopyStream);
    console.log(`  COPY complete: ${oracleCards.length} rows`);

    // Upsert from staging into card_names
    const cardResult = await client.query(`
      INSERT INTO card_names (oracle_id, name, normalized_name)
      SELECT oracle_id, name, normalized_name
      FROM staging_cards
      ON CONFLICT (normalized_name) DO UPDATE SET
        oracle_id = EXCLUDED.oracle_id,
        name = EXCLUDED.name,
        updated_at = NOW()
    `);
    console.log(`Upserted ${cardResult.rowCount} card names`);

    await client.query('DROP TABLE IF EXISTS staging_cards');

    // ===== Phase 2: Default Cards -> sets + card_printings tables =====
    console.log('\nFetching Default Cards bulk data URL...');
    const defaultUrl = await getDownloadUrl('default-cards');
    console.log(`Downloading from: ${defaultUrl}`);

    // Collect sets and printings (filtering out digital)
    const setsMap = new Map<string, string>(); // code → name
    const printings: any[] = [];

    const defaultRes = await fetch(defaultUrl);
    if (!defaultRes.ok || !defaultRes.body)
      throw new Error('Failed to download default cards');

    const defaultStream = chain([
      Readable.fromWeb(defaultRes.body as any),
      parser(),
      streamArray(),
    ]);

    for await (const { value: card } of defaultStream) {
      if (!PLAYABLE_LAYOUTS.has(card.layout)) continue;
      if (!card.oracle_id) continue;
      if (card.digital) continue; // Skip digital-only printings

      // Collect unique sets
      if (!setsMap.has(card.set)) {
        setsMap.set(card.set, card.set_name);
      }

      const imageUri =
        card.image_uris?.normal || card.image_uris?.small || null;

      printings.push({
        scryfall_id: card.id,
        oracle_id: card.oracle_id,
        set_code: card.set,
        collector_number: card.collector_number,
        rarity: card.rarity || null,
        image_uri: imageUri,
        layout: card.layout,
      });
    }

    console.log(`Collected ${setsMap.size} sets, ${printings.length} printings (digital filtered out)`);

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

    // Summary
    const cardNameCount = await client.query('SELECT COUNT(*) FROM card_names');
    const setCount = await client.query('SELECT COUNT(*) FROM sets');
    const printingCount = await client.query(
      'SELECT COUNT(*) FROM card_printings',
    );
    console.log(`\nSeed complete!`);
    console.log(`  Card Names: ${cardNameCount.rows[0].count}`);
    console.log(`  Sets: ${setCount.rows[0].count}`);
    console.log(`  Printings: ${printingCount.rows[0].count}`);
  } finally {
    await client.end();
  }
}

seedScryfall().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
