#!/usr/bin/env node
/**
 * Repair historical Shopify product-ID mappings in production.
 *
 * This follows the Scryfall production seed pattern: reads and writes reach
 * Postgres only through SSH and the production container's Docker secret.
 * Shopify requests run locally and use exact `product(handle:)` lookups; this
 * never discovers, paginates, or changes catalog offers.
 */
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const sshHost = process.env.PRODUCTION_SSH_HOST ?? 'scoutlgs_lan';
const postgresService = process.env.PRODUCTION_POSTGRES_SERVICE ?? 'scoutlgs_postgres';
const apiVersion = process.env.SHOPIFY_STOREFRONT_API_VERSION ?? '2026-04';
const DEFAULT_CONCURRENCY = 4;
const HANDLE_BATCH_SIZE = 50;
const REQUEST_INTERVAL_MS = 1_000;

function usage() {
  console.error(`Usage: pnpm seed:prod:shopify-mappings --confirm (--store-id <id> (--limit <n> | --all) | --all-stores) [--concurrency <n>] [--store-concurrency <n>]

Repairs existing Shopify listings missing a product ID. --all processes the
whole selected store in internal 500-row batches. --all-stores discovers and
repairs every Shopify storefront in parallel. Exact handle lookups are sent
50 at a time in one Storefront GraphQL request. It only maps
exact existing product handles and never alters prices, variants, or stock.

Environment: PRODUCTION_SSH_HOST, PRODUCTION_POSTGRES_SERVICE,
SHOPIFY_STOREFRONT_API_VERSION`);
}

function arg(name) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
function productionPsqlCommand() {
  return String.raw`set -eu
container="$(docker ps -q --filter 'name=${postgresService}' | head -n 1)"
[ -n "$container" ] || { echo 'Production Postgres container was not found.' >&2; exit 1; }
docker exec -i "$container" sh -ceu '
  export PGPASSWORD="$(cat /run/secrets/postgres_password)"
  exec psql -v ON_ERROR_STOP=1 --username=postgres --dbname=scoutlgs
'`;
}
function run(command, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'inherit'] });
    const output = [];
    child.stdout.on('data', (chunk) => output.push(chunk));
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve(Buffer.concat(output).toString()) : reject(new Error(`${command} exited with status ${code}`)));
    if (input !== undefined) child.stdin.end(input);
  });
}
function copyEscape(value) { return value == null ? '\\N' : String(value).replaceAll('\\', '\\\\').replaceAll('\t', '\\t').replaceAll('\n', '\\n').replaceAll('\r', '\\r'); }

async function readCandidates(storeId, limit, afterListingId = 0) {
  const query = `SELECT cl.id, cl.store_id, cl.product_url_id, pu.handle, s.base_url,
    COALESCE(s.scraper_config->>'shopifyUrl', ''), COALESCE(s.scraper_config->>'storefrontApiVersion', '')
    FROM card_listings cl
    JOIN stores s ON s.id = cl.store_id AND s.platform_type = 'shopify_storefront'
    JOIN product_urls pu ON pu.id = cl.product_url_id
    LEFT JOIN shopify_products sp ON sp.card_listing_id = cl.id
    WHERE cl.store_id = ${storeId} AND sp.shopify_product_id IS NULL AND cl.id > ${afterListingId}
    ORDER BY cl.id LIMIT ${limit};`;
  const output = await run('ssh', [sshHost, productionPsqlCommand()], `\\set QUIET 1
\\pset tuples_only on
\\pset format unaligned
\\pset fieldsep '\t'
${query}`);
  return output.trim() ? output.trim().split('\n').map((line) => {
    const [listingId, rowStoreId, productUrlId, handle, baseUrl, shopifyUrl, version] = line.split('\t');
    if (!listingId || !rowStoreId || !productUrlId || !handle || !baseUrl) throw new Error(`Unexpected production listing row: ${line}`);
    return { listingId, storeId: rowStoreId, productUrlId, handle, baseUrl, shopifyUrl, version };
  }) : [];
}

async function readShopifyStoreIds() {
  const output = await run('ssh', [sshHost, productionPsqlCommand()], `\\set QUIET 1
\\pset tuples_only on
\\pset format unaligned
SELECT id FROM stores WHERE platform_type = 'shopify_storefront' ORDER BY id;`);
  return output.trim() ? output.trim().split('\n').map(Number).filter(Number.isInteger) : [];
}

async function countCandidates(storeId) {
  const output = await run('ssh', [sshHost, productionPsqlCommand()], `\\set QUIET 1
\\pset tuples_only on
\\pset format unaligned
SELECT COUNT(*) FROM card_listings cl
JOIN stores s ON s.id = cl.store_id AND s.platform_type = 'shopify_storefront'
LEFT JOIN shopify_products sp ON sp.card_listing_id = cl.id
WHERE cl.store_id = ${storeId} AND sp.shopify_product_id IS NULL;`);
  const count = Number(output.trim());
  if (!Number.isInteger(count) || count < 0) throw new Error(`Unexpected mapping count for store ${storeId}: ${output}`);
  return count;
}

async function lookupBatch(candidates) {
  const candidate = candidates[0];
  const host = candidate.shopifyUrl || new URL(candidate.baseUrl).host;
  const variables = Object.fromEntries(candidates.map((item, index) => [`handle${index}`, item.handle]));
  const definitions = candidates.map((_, index) => `$handle${index}: String!`).join(', ');
  const fields = candidates.map((_, index) => `p${index}: product(handle: $handle${index}) { id handle title }`).join('\n');
  const response = await fetch(`https://${host}/api/${candidate.version || apiVersion}/graphql.json`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'ScoutLGS mapping repair' },
    body: JSON.stringify({ query: `query ProductsByHandles(${definitions}) { ${fields} }`, variables }), signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Shopify HTTP ${response.status} for ${candidates.length} handle lookups`);
  const body = await response.json();
  if (body.errors?.length) throw new Error(`Shopify GraphQL error: ${body.errors[0].message}`);
  return candidates.flatMap((item, index) => {
    const product = body.data?.[`p${index}`];
    return product ? [{ ...item, productId: product.id.split('/').pop(), title: product.title }] : [];
  });
}

async function writeMappings(rows) {
  if (!rows.length) return;
  const values = rows.map((row) => [row.productId, row.storeId, row.productUrlId, row.listingId, row.title, 'false', 'matched'].map(copyEscape).join('\t')).join('\n');
  const sql = `BEGIN;
CREATE TEMP TABLE mapping_backfill (shopify_product_id bigint, store_id integer, product_url_id integer, card_listing_id integer, raw_product_title varchar(500), is_token boolean, match_status varchar(20)) ON COMMIT DROP;
COPY mapping_backfill FROM STDIN;
${values}
\\.
INSERT INTO shopify_products (shopify_product_id, store_id, product_url_id, card_listing_id, raw_product_title, is_token, match_status)
SELECT shopify_product_id, store_id, product_url_id, card_listing_id, raw_product_title, is_token, match_status FROM mapping_backfill
ON CONFLICT (shopify_product_id) DO UPDATE SET product_url_id = EXCLUDED.product_url_id, card_listing_id = EXCLUDED.card_listing_id, raw_product_title = EXCLUDED.raw_product_title, match_status = 'matched', updated_at = NOW();
COMMIT;`;
  await run('ssh', [sshHost, productionPsqlCommand()], sql);
}

async function mapCandidates(candidates, concurrency, onProgress) {
  let nextIndex = 0;
  let nextRequestAt = 0;
  const takeRequestSlot = async () => {
    const now = Date.now();
    const scheduledAt = Math.max(now, nextRequestAt);
    nextRequestAt = scheduledAt + REQUEST_INTERVAL_MS;
    if (scheduledAt > now) await new Promise((resolve) => setTimeout(resolve, scheduledAt - now));
  };
  let completed = 0;
  const workers = Array.from({ length: Math.min(concurrency, Math.ceil(candidates.length / HANDLE_BATCH_SIZE)) }, async () => {
    const mapped = []; let missing = 0;
    while (true) {
      const batch = candidates.slice(nextIndex, nextIndex + HANDLE_BATCH_SIZE);
      nextIndex += HANDLE_BATCH_SIZE;
      if (!batch.length) break;
      await takeRequestSlot();
      const products = await lookupBatch(batch);
      mapped.push(...products);
      missing += batch.length - products.length;
      completed += batch.length;
      onProgress?.(completed, candidates.length);
    }
    return { mapped, missing };
  });
  const results = await Promise.all(workers);
  return { mapped: results.flatMap((result) => result.mapped), missing: results.reduce((sum, result) => sum + result.missing, 0) };
}

async function backfillStore(storeId, all, limit, concurrency) {
  const initialTotal = await countCandidates(storeId);
  console.log(`[store ${storeId}] ${initialTotal.toLocaleString()} unmapped listings to process.`);
  let mappedTotal = 0; let missingTotal = 0; let batches = 0; let afterListingId = 0; let processedTotal = 0;
  do {
    const candidates = await readCandidates(storeId, all ? 500 : limit, afterListingId);
    if (!candidates.length) break;
    afterListingId = Number(candidates[candidates.length - 1].listingId);
    batches++;
    const { mapped, missing } = await mapCandidates(candidates, concurrency, (completed, batchTotal) => {
      if (completed % 25 === 0 || completed === batchTotal) {
        console.log(`[store ${storeId}] ${Math.min(processedTotal + completed, initialTotal).toLocaleString()} / ${initialTotal.toLocaleString()} looked up (batch ${batches}, ${completed}/${batchTotal}).`);
      }
    });
    missingTotal += missing;
    await writeMappings(mapped);
    mappedTotal += mapped.length;
    processedTotal += candidates.length;
    console.log(`[store ${storeId}] batch ${batches} saved: ${mapped.length} mapped; ${candidates.length - mapped.length} absent upstream.`);
    if (!all) break;
  } while (true);
  console.log(`[store ${storeId}] complete: ${mappedTotal.toLocaleString()} mapped; ${missingTotal.toLocaleString()} handles absent upstream.`);
}

async function main() {
  const storeId = Number(arg('--store-id'));
  const all = process.argv.includes('--all');
  const allStores = process.argv.includes('--all-stores');
  const requestedLimit = arg('--limit');
  const limit = Math.min(Number(requestedLimit ?? 100), 500);
  const concurrency = Number(arg('--concurrency') ?? DEFAULT_CONCURRENCY);
  const storeConcurrency = Number(arg('--store-concurrency') ?? 2);
  const validSingleStore = Number.isInteger(storeId) && storeId > 0 && (all !== Boolean(requestedLimit));
  if (!process.argv.includes('--confirm') || (allStores === validSingleStore) || !Number.isInteger(limit) || limit <= 0 || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 10 || !Number.isInteger(storeConcurrency) || storeConcurrency < 1 || storeConcurrency > 4) { usage(); process.exitCode = 2; return; }
  const storeIds = allStores ? await readShopifyStoreIds() : [storeId];
  console.log(`Starting ${storeIds.length} Shopify store backfill${storeIds.length === 1 ? '' : 's'} with ${storeConcurrency} stores in parallel.`);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(storeConcurrency, storeIds.length) }, async () => {
    while (nextIndex < storeIds.length) {
      const nextStoreId = storeIds[nextIndex++];
      await backfillStore(nextStoreId, allStores || all, limit, concurrency);
    }
  });
  await Promise.all(workers);
}
main().catch((error) => { console.error(`Production Shopify mapping backfill failed: ${error.message}`); process.exitCode = 1; });
