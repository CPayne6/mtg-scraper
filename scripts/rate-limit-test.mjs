/**
 * Rate Limit Discovery Test
 *
 * Tests Shopify rate limits by sending HEAD requests at increasing concurrency.
 * Also tests whether different Shopify stores share rate limits.
 *
 * Usage:
 *   node scripts/rate-limit-test.mjs                   # direct (no proxy)
 *   node scripts/rate-limit-test.mjs --proxy            # via Webshare proxy
 *   node scripts/rate-limit-test.mjs --cross-store      # test cross-store rate limit sharing
 *   node scripts/rate-limit-test.mjs --proxy --cross-store
 */

import { createRequire } from 'module';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

// Load undici from pnpm store
const undici = require(resolve(__dirname, '../node_modules/.pnpm/undici@7.16.0/node_modules/undici'));
const { fetch: undiFetch, ProxyAgent } = undici;

// Load dotenv
const dotenv = require(resolve(__dirname, '../node_modules/.pnpm/dotenv@16.4.7/node_modules/dotenv'));
dotenv.config({ path: resolve(__dirname, '../apps/scraper/.env') });

// ── Stores to test ──────────────────────────────────────────────────────────
const STORES = [
  {
    name: 'face-to-face-games',
    baseUrl: 'https://www.facetofacegames.com',
    collectionSlug: 'magic-the-gathering-singles',
  },
  {
    name: '401-games',
    baseUrl: 'https://store.401games.ca',
    collectionSlug: 'magic-the-gathering-singles',
  },
  {
    name: 'hobbiesville',
    baseUrl: 'https://www.hobbiesville.ca',
    collectionSlug: 'magic-singles',
  },
  {
    name: 'house-of-cards',
    baseUrl: 'https://houseofcards.ca',
    collectionSlug: 'mtg-singles-all-products',
  },
];

// ── Config ──────────────────────────────────────────────────────────────────
const CONCURRENCY_LEVELS = [50, 100, 200, 300, 500, 750, 1000];
const REQUESTS_PER_LEVEL = 1000;
const USER_AGENT = 'Mozilla/5.0 (compatible; ScoutLGS/1.0; +https://scoutlgs.com)';

const args = process.argv.slice(2);
const useProxy = args.includes('--proxy');
const crossStoreTest = args.includes('--cross-store');
const storeFilter = args.find(a => a.startsWith('--store='))?.split('=')[1];
const initialWait = parseInt(args.find(a => a.startsWith('--wait='))?.split('=')[1] || '0', 10);
const singleIp = args.includes('--single-ip'); // For cross-store: use same proxy IP for all requests

// ── Proxy setup ─────────────────────────────────────────────────────────────
const PROXY_IP_COUNT = 1000;
let proxyCounter = 0;

// Cache of ProxyAgent instances keyed by proxy number
const proxyAgentCache = new Map();

function getProxyCredentials() {
  const host = process.env.WEBSHARE_HOST || 'p.webshare.io';
  const port = process.env.WEBSHARE_PORT || '80';
  const username = process.env.WEBSHARE_USERNAME;
  const password = process.env.WEBSHARE_PASSWORD;

  if (!username || !password) {
    console.error('Proxy credentials not found in env. Run without --proxy or set WEBSHARE_USERNAME/PASSWORD.');
    process.exit(1);
  }

  return { host, port, username, password };
}

function createProxyAgent(proxyNumber = 1) {
  if (proxyAgentCache.has(proxyNumber)) {
    return proxyAgentCache.get(proxyNumber);
  }

  const { host, port, username, password } = getProxyCredentials();
  const uri = `http://${username}-${proxyNumber}:${password}@${host}:${port}`;
  const agent = new ProxyAgent({ uri, connections: 10, keepAliveTimeout: 60000 });
  proxyAgentCache.set(proxyNumber, agent);
  return agent;
}

/** Get the next rotating proxy agent (cycles 1..PROXY_IP_COUNT). */
function getNextProxyAgent() {
  proxyCounter = (proxyCounter % PROXY_IP_COUNT) + 1;
  return createProxyAgent(proxyCounter);
}

async function closeAllProxyAgents() {
  for (const [, agent] of proxyAgentCache) {
    await agent.close();
  }
  proxyAgentCache.clear();
}

// ── Fetch product handles from sitemap ──────────────────────────────────────
async function fetchHandles(store, count = 300) {
  console.log(`  Fetching ${count} handles from ${store.name} sitemap...`);

  const fetchDispatcher = useProxy ? getNextProxyAgent() : undefined;

  const sitemapResp = await undiFetch(`${store.baseUrl}/sitemap.xml`, {
    dispatcher: fetchDispatcher,
    signal: AbortSignal.timeout(30000),
    headers: { 'User-Agent': USER_AGENT },
  });
  const xml = await sitemapResp.text();

  // Get product sitemap URLs — try sitemap_products first, then any sitemap with "products"
  let sitemapUrls = [...xml.matchAll(/<loc>([^<]*sitemap_products[^<]*)<\/loc>/g)]
    .map(m => m[1]);

  if (sitemapUrls.length === 0) {
    // Try broader pattern
    sitemapUrls = [...xml.matchAll(/<loc>([^<]*products[^<]*\.xml[^<]*)<\/loc>/g)]
      .map(m => m[1]);
  }

  if (sitemapUrls.length === 0) {
    // Fallback: fetch /products.json directly for handles
    console.log(`  No product sitemaps, trying /products.json...`);
    try {
      const jsonResp = await undiFetch(`${store.baseUrl}/products.json?limit=250`, {
        dispatcher: fetchDispatcher,
        signal: AbortSignal.timeout(30000),
        headers: { 'User-Agent': USER_AGENT },
      });
      const json = await jsonResp.json();
      const handles = (json.products || []).map(p => p.handle).slice(0, count);
      console.log(`  Got ${handles.length} handles from ${store.name} (products.json)`);
      return handles;
    } catch (e) {
      console.error(`  Could not fetch handles for ${store.name}: ${e.message}`);
      return [];
    }
  }

  // Parse first product sitemap for handles
  const productResp = await undiFetch(sitemapUrls[0], {
    dispatcher: fetchDispatcher,
    signal: AbortSignal.timeout(60000),
    headers: { 'User-Agent': USER_AGENT },
  });
  const productXml = await productResp.text();

  const handles = [...productXml.matchAll(/\/products\/([^</?#]+)/g)]
    .map(m => m[1])
    .filter((v, i, a) => a.indexOf(v) === i) // dedupe
    .slice(0, count);

  console.log(`  Got ${handles.length} handles from ${store.name}`);
  return handles;
}

// ── Single HEAD request ─────────────────────────────────────────────────────
async function headRequest(url, dispatcher) {
  const start = performance.now();
  try {
    const response = await undiFetch(url, {
      method: 'HEAD',
      redirect: 'manual',
      dispatcher,
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': USER_AGENT },
    });
    const elapsed = performance.now() - start;
    return { status: response.status, elapsed, error: null };
  } catch (error) {
    const elapsed = performance.now() - start;
    return { status: 0, elapsed, error: error.message || String(error) };
  }
}

// ── Run concurrent batch ────────────────────────────────────────────────────
// dispatcher can be:
//   - a ProxyAgent (fixed single IP)
//   - 'rotating' (use getNextProxyAgent per request)
//   - undefined (direct, no proxy)
async function runBatch(urls, concurrency, dispatcher) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < urls.length) {
      const i = index++;
      const agent = dispatcher === 'rotating' ? getNextProxyAgent() : dispatcher;
      const result = await headRequest(urls[i], agent);
      results.push(result);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, urls.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ── Summarize results ───────────────────────────────────────────────────────
function summarize(results) {
  const statusCounts = {};
  let totalElapsed = 0;

  for (const r of results) {
    const key = r.error ? `err` : r.status;
    statusCounts[key] = (statusCounts[key] || 0) + 1;
    totalElapsed += r.elapsed;
  }

  const sortedLatencies = results.map(r => r.elapsed).sort((a, b) => a - b);
  const avgLatency = totalElapsed / results.length;
  const p50 = sortedLatencies[Math.floor(results.length * 0.50)];
  const p99 = sortedLatencies[Math.floor(results.length * 0.99)];

  return { statusCounts, avgLatency, p50, p99, total: results.length };
}

function formatStatus(statusCounts) {
  return Object.entries(statusCounts)
    .sort(([a], [b]) => String(a).localeCompare(String(b)))
    .map(([code, count]) => `${code}:${count}`)
    .join('  ');
}

// ── Test 1: Single store ramp ───────────────────────────────────────────────
async function testSingleStoreRamp(store) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`RATE LIMIT RAMP TEST: ${store.name}`);
  console.log(`Mode: ${useProxy ? 'PROXY' : 'DIRECT'}`);
  console.log(`${'='.repeat(70)}`);

  const handles = await fetchHandles(store, REQUESTS_PER_LEVEL);
  if (handles.length === 0) return;

  const urls = handles.map(h =>
    `${store.baseUrl}/collections/${store.collectionSlug}/products/${h}`
  );

  const dispatcher = useProxy ? 'rotating' : undefined;

  for (const concurrency of CONCURRENCY_LEVELS) {
    const testUrls = [];
    for (let i = 0; i < REQUESTS_PER_LEVEL; i++) {
      testUrls.push(urls[i % urls.length]);
    }

    const start = performance.now();
    const results = await runBatch(testUrls, concurrency, dispatcher);
    const wallTime = ((performance.now() - start) / 1000).toFixed(2);
    const summary = summarize(results);

    const rateLimit429 = summary.statusCounts[429] || 0;
    const marker = rateLimit429 > 0 ? ' << RATE LIMITED' : '';

    console.log(
      `  c=${String(concurrency).padStart(3)}  |  ${formatStatus(summary.statusCounts).padEnd(30)}  |  ` +
      `avg: ${summary.avgLatency.toFixed(0).padStart(5)}ms  p99: ${summary.p99?.toFixed(0).padStart(5)}ms  |  ` +
      `wall: ${wallTime.padStart(6)}s  rps: ${(REQUESTS_PER_LEVEL / parseFloat(wallTime)).toFixed(1).padStart(6)}${marker}`
    );

    // Brief pause between levels to let rate limits reset
    await new Promise(r => setTimeout(r, 3000));
  }

  if (useProxy) await closeAllProxyAgents();
}

// ── Generate synthetic handles for testing (avoids sitemap fetch) ────────────
function generateTestHandles(store, count = 200) {
  // Use sequential product-like handles that will return 301/404 (doesn't matter, we're testing rate limits)
  const handles = [];
  for (let i = 1; i <= count; i++) {
    handles.push(`test-product-handle-${i}`);
  }
  return handles;
}

// ── Test 2: Cross-store rate limit sharing ──────────────────────────────────
async function testCrossStoreSharing() {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`CROSS-STORE RATE LIMIT SHARING TEST`);
  const proxyMode = useProxy ? (singleIp ? 'PROXY (single IP)' : 'PROXY (rotating IPs)') : 'DIRECT (same IP)';
  console.log(`Mode: ${proxyMode}`);
  console.log(`Testing if hitting Store A affects Store B's rate limits`);
  console.log(`${'='.repeat(70)}`);

  const storeA = STORES[0]; // F2F
  const storeB = STORES[1]; // 401

  console.log(`\n  Store A: ${storeA.name} (${storeA.baseUrl})`);
  console.log(`  Store B: ${storeB.name} (${storeB.baseUrl})`);

  // Use synthetic handles — avoids sitemap/API fetches that can also get rate-limited
  const handlesA = generateTestHandles(storeA, 200);
  const handlesB = generateTestHandles(storeB, 200);

  const urlsA = handlesA.map(h =>
    `${storeA.baseUrl}/collections/${storeA.collectionSlug}/products/${h}`
  );
  const urlsB = handlesB.map(h =>
    `${storeB.baseUrl}/collections/${storeB.collectionSlug}/products/${h}`
  );

  // Single IP mode: use one fixed proxy agent. Rotating: different IP per request
  const dispatcher = useProxy ? (singleIp ? createProxyAgent(500) : 'rotating') : undefined;

  // Step 1: Baseline for store B (low concurrency, should succeed)
  console.log(`\n  [1/3] Baseline: Store B alone (c=10, 50 reqs)`);
  const baseline = await runBatch(urlsB.slice(0, 50), 10, dispatcher);
  const baselineSummary = summarize(baseline);
  console.log(`    ${formatStatus(baselineSummary.statusCounts)}  avg: ${baselineSummary.avgLatency.toFixed(0)}ms`);

  await new Promise(r => setTimeout(r, 2000));

  // Step 2: Hammer store A hard to trigger rate limiting
  console.log(`\n  [2/3] Hammering Store A (c=200, 200 reqs)...`);
  const hammerUrls = [];
  for (let i = 0; i < 200; i++) hammerUrls.push(urlsA[i % urlsA.length]);
  const hammer = await runBatch(hammerUrls, 200, dispatcher);
  const hammerSummary = summarize(hammer);
  console.log(`    ${formatStatus(hammerSummary.statusCounts)}  avg: ${hammerSummary.avgLatency.toFixed(0)}ms`);

  // Step 3: Immediately test store B (no pause — check if A's rate limit spills over)
  console.log(`\n  [3/3] Store B immediately after hammering A (c=10, 50 reqs)`);
  const after = await runBatch(urlsB.slice(50, 100), 10, dispatcher);
  const afterSummary = summarize(after);
  console.log(`    ${formatStatus(afterSummary.statusCounts)}  avg: ${afterSummary.avgLatency.toFixed(0)}ms`);

  const baseline429 = baselineSummary.statusCounts[429] || 0;
  const after429 = afterSummary.statusCounts[429] || 0;
  const hammer429 = hammerSummary.statusCounts[429] || 0;

  console.log(`\n  ANALYSIS:`);
  console.log(`    Store A hammer: ${hammer429}/200 got 429`);
  console.log(`    Store B baseline: ${baseline429}/50 got 429`);
  console.log(`    Store B after:    ${after429}/50 got 429`);

  if (hammer429 === 0) {
    console.log(`  ⚠ Store A was NOT rate limited — test inconclusive (need more requests or higher concurrency)`);
  } else if (after429 > baseline429 + 3) {
    console.log(`  → Rate limits appear SHARED across stores (per-IP or per-Shopify-platform)`);
  } else {
    console.log(`  → Rate limits appear INDEPENDENT per store`);
  }

  if (useProxy) await closeAllProxyAgents();
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Shopify Rate Limit Test');
  console.log(`Proxy: ${useProxy ? 'YES' : 'NO (direct)'}`);
  console.log(`Cross-store: ${crossStoreTest ? 'YES' : 'NO'}`);
  console.log(`Concurrency levels: ${CONCURRENCY_LEVELS.join(', ')}`);
  console.log(`Requests per level: ${REQUESTS_PER_LEVEL}\n`);

  if (initialWait > 0) {
    console.log(`Waiting ${initialWait}s for rate limits to reset...`);
    await new Promise(r => setTimeout(r, initialWait * 1000));
  }

  if (crossStoreTest) {
    await testCrossStoreSharing();
  } else {
    const stores = storeFilter
      ? STORES.filter(s => s.name.includes(storeFilter))
      : STORES;
    if (stores.length === 0) {
      console.log(`No stores matching "${storeFilter}". Available: ${STORES.map(s => s.name).join(', ')}`);
      return;
    }
    for (const store of stores) {
      await testSingleStoreRamp(store);
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  console.log('\nDone.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
