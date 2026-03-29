/**
 * Test: Do Shopify stores share rate limits per IP?
 *
 * Strategy:
 * 1. Confirm Store A and Store B are both accessible (200)
 * 2. Hammer Store A until we get a 429
 * 3. Immediately try Store B — if 429, rate limits are shared
 * 4. If Store B returns 200, rate limits are per-store
 *
 * Uses direct connection (no proxy) so all requests come from same IP.
 */

const STORE_A = {
  name: 'exor-games',
  baseUrl: 'https://exorgames.com',
  handle: 'fallen-askari-visions', // known product
};

const STORE_B = {
  name: 'house-of-cards',
  baseUrl: 'https://houseofcards.ca',
  handle: 'blood-operative-guilds-of-ravnica',
};

const STORE_C = {
  name: 'game-knight',
  baseUrl: 'https://gameknight.ca',
  handle: '101056n',
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const TIMEOUT = 10000;

async function fetchProduct(store, label = '') {
  const url = `${store.baseUrl}/products/${store.handle}.js`;
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    clearTimeout(timer);
    const elapsed = Date.now() - start;
    return { store: store.name, status: res.status, elapsed, label, error: null };
  } catch (e) {
    const elapsed = Date.now() - start;
    return { store: store.name, status: null, elapsed, label, error: e.message };
  }
}

function log(result) {
  const status = result.status || 'ERR';
  const tag = result.label ? ` [${result.label}]` : '';
  console.log(`  ${status} ${result.store} (${result.elapsed}ms)${tag}${result.error ? ' - ' + result.error : ''}`);
}

async function main() {
  console.log('='.repeat(70));
  console.log('Shopify Shared Rate Limit Test');
  console.log('='.repeat(70));
  console.log();

  // Phase 1: Confirm both stores are accessible
  console.log('Phase 1: Baseline — confirm stores are accessible');
  const baseA = await fetchProduct(STORE_A, 'baseline');
  log(baseA);
  const baseB = await fetchProduct(STORE_B, 'baseline');
  log(baseB);
  const baseC = await fetchProduct(STORE_C, 'baseline');
  log(baseC);

  if (baseA.status === 429 || baseB.status === 429 || baseC.status === 429) {
    console.log('\nAlready rate limited from previous activity. Wait a few minutes and retry.');
    return;
  }

  if (baseA.status !== 200 || baseB.status !== 200 || baseC.status !== 200) {
    console.log('\nStores not returning 200 — cannot run test.');
    return;
  }

  console.log('\nAll stores accessible. Starting rate limit test...\n');

  // Phase 2: Hammer Store A until 429
  console.log('Phase 2: Hammering Store A (exor-games) with rapid requests...');
  let hitCount = 0;
  let rateLimited = false;
  const BATCH_SIZE = 50;
  const MAX_REQUESTS = 1000;

  while (!rateLimited && hitCount < MAX_REQUESTS) {
    const batch = Array.from({ length: BATCH_SIZE }, () => fetchProduct(STORE_A, `req-${hitCount + 1}`));
    const results = await Promise.all(batch);
    hitCount += BATCH_SIZE;

    for (const r of results) {
      if (r.status === 429) {
        rateLimited = true;
        console.log(`  429 hit after ${hitCount} requests!`);
        break;
      }
    }

    if (!rateLimited) {
      process.stdout.write(`  ${hitCount} requests sent (all 200)...\r`);
    }
  }

  if (!rateLimited) {
    console.log(`\nCouldn't trigger 429 after ${MAX_REQUESTS} requests. Store may have high limits.`);
    return;
  }

  // Phase 3: Immediately burst other stores to see if rate limit leaked
  const CROSS_BURST = 50;
  console.log(`\nPhase 3: Bursting ${CROSS_BURST} requests to each other store (same IP)...`);

  // Also burst Store A again to confirm it's still limited
  console.log('\n  Store A (exor-games) — should still be limited:');
  const burstA = await Promise.all(Array.from({ length: CROSS_BURST }, (_, i) => fetchProduct(STORE_A, `burst-${i + 1}`)));
  const a429 = burstA.filter(r => r.status === 429).length;
  const a200 = burstA.filter(r => r.status === 200).length;
  console.log(`    200: ${a200} | 429: ${a429} | other: ${CROSS_BURST - a200 - a429}`);

  console.log('\n  Store B (house-of-cards):');
  const burstB = await Promise.all(Array.from({ length: CROSS_BURST }, (_, i) => fetchProduct(STORE_B, `burst-${i + 1}`)));
  const b429 = burstB.filter(r => r.status === 429).length;
  const b200 = burstB.filter(r => r.status === 200).length;
  console.log(`    200: ${b200} | 429: ${b429} | other: ${CROSS_BURST - b200 - b429}`);

  console.log('\n  Store C (game-knight):');
  const burstC = await Promise.all(Array.from({ length: CROSS_BURST }, (_, i) => fetchProduct(STORE_C, `burst-${i + 1}`)));
  const c429 = burstC.filter(r => r.status === 429).length;
  const c200 = burstC.filter(r => r.status === 200).length;
  console.log(`    200: ${c200} | 429: ${c429} | other: ${CROSS_BURST - c200 - c429}`);

  console.log();

  // Analysis
  console.log('── Result ──────────────────────────────────────────────────────');
  console.log(`Store A (hammered): ${a200} ok / ${a429} limited`);
  console.log(`Store B (cross):    ${b200} ok / ${b429} limited`);
  console.log(`Store C (cross):    ${c200} ok / ${c429} limited`);
  console.log();

  if (b429 === 0 && c429 === 0) {
    console.log('ISOLATED: Other stores had zero 429s — rate limits are per-store per IP.');
    console.log('→ Rate limiting can be per-IP-per-store.');
  } else if (b429 > 0 && c429 > 0) {
    console.log('SHARED: Other stores also hit 429s — Shopify shares rate limits per IP.');
    console.log('→ Rate limiting should be per-IP (not per-IP-per-store).');
  } else {
    console.log('MIXED: Partial spillover detected.');
    console.log('→ May be a shared bucket with per-store weighting.');
  }
}

main().catch(console.error);
