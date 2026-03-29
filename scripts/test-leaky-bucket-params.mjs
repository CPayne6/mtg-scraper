/**
 * Leaky Bucket Parameter Discovery
 *
 * Determines bucket size and leak rate for a Shopify store's /products/*.js endpoint.
 *
 * Usage: node scripts/test-leaky-bucket-params.mjs <baseUrl> <handle>
 *
 * Algorithm:
 *   Phase 1 — Bucket size: Send sequential requests as fast as possible, count 200s before first 429
 *   Phase 2 — Leak rate: Wait known intervals, burst again, measure how many tokens refilled
 *   Phase 3 — Verify: Cross-check with a sustained rate test
 */

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node test-leaky-bucket-params.mjs <baseUrl> <handle>');
  process.exit(1);
}

const BASE_URL = args[0];
const HANDLE = args[1];
const PRODUCT_URL = `${BASE_URL}/products/${HANDLE}.js`;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function singleRequest() {
  const start = Date.now();
  try {
    const res = await fetch(PRODUCT_URL, {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    return { status: res.status, elapsed: Date.now() - start, retryAfter: res.headers.get('retry-after') };
  } catch (e) {
    return { status: 0, elapsed: Date.now() - start, error: e.message };
  }
}

async function burstRequests(count) {
  const results = await Promise.all(Array.from({ length: count }, () => singleRequest()));
  const ok = results.filter(r => r.status === 200).length;
  const limited = results.filter(r => r.status === 429).length;
  const other = count - ok - limited;
  return { ok, limited, other, results };
}

async function sequentialUntil429(maxRequests = 500) {
  let count = 0;
  for (let i = 0; i < maxRequests; i++) {
    const r = await singleRequest();
    if (r.status === 429) {
      return { requestsBeforeLimit: count, retryAfter: r.retryAfter };
    }
    if (r.status === 200) {
      count++;
    } else {
      // Non-200, non-429 — something else going on
      return { requestsBeforeLimit: count, error: `Unexpected status ${r.status}` };
    }
  }
  return { requestsBeforeLimit: count, note: 'max reached without 429' };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const storeName = new URL(BASE_URL).hostname;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Leaky Bucket Test: ${storeName}`);
  console.log(`Product: ${PRODUCT_URL}`);
  console.log(`${'='.repeat(60)}\n`);

  // Phase 0: Baseline
  console.log('Phase 0: Baseline check...');
  const baseline = await singleRequest();
  if (baseline.status !== 200) {
    console.log(`  FAIL: Baseline returned ${baseline.status}. Already rate limited or unreachable.`);
    console.log(`  Waiting 60s for bucket to refill...`);
    await sleep(60000);
    const retry = await singleRequest();
    if (retry.status !== 200) {
      console.log(`  Still ${retry.status}. Cannot proceed.`);
      console.log(JSON.stringify({ store: storeName, error: 'Cannot reach store' }));
      return;
    }
  }
  console.log(`  OK (${baseline.elapsed}ms)\n`);

  // Phase 1: Bucket size — sequential requests until 429
  console.log('Phase 1: Measuring bucket size (sequential requests until 429)...');
  const bucketTest = await sequentialUntil429(500);
  console.log(`  Requests before 429: ${bucketTest.requestsBeforeLimit}`);
  if (bucketTest.retryAfter) console.log(`  Retry-After header: ${bucketTest.retryAfter}s`);
  if (bucketTest.note) console.log(`  Note: ${bucketTest.note}`);

  const bucketSize = bucketTest.requestsBeforeLimit;

  // Phase 2: Leak rate — wait, then measure how many tokens refilled
  // We'll test multiple wait intervals to calculate rate
  console.log('\nPhase 2: Measuring leak rate...');

  const leakTests = [];

  for (const waitSec of [5, 10, 20]) {
    console.log(`  Waiting ${waitSec}s for bucket to partially refill...`);
    await sleep(waitSec * 1000);

    const refillTest = await sequentialUntil429(200);
    const refilled = refillTest.requestsBeforeLimit;
    const leakRate = refilled / waitSec;

    console.log(`    Refilled: ${refilled} tokens in ${waitSec}s = ~${leakRate.toFixed(1)} tokens/sec`);
    leakTests.push({ waitSec, refilled, leakRate });
  }

  // Phase 3: Full refill test — wait long enough for full refill, remeasure bucket
  console.log('\nPhase 3: Full refill test (waiting 60s)...');
  await sleep(60000);

  const fullRefillTest = await sequentialUntil429(500);
  console.log(`  Bucket size after full refill: ${fullRefillTest.requestsBeforeLimit}`);

  // Summary
  const avgLeakRate = leakTests.reduce((sum, t) => sum + t.leakRate, 0) / leakTests.length;

  console.log(`\n${'='.repeat(60)}`);
  console.log('RESULTS');
  console.log(`${'='.repeat(60)}`);
  console.log(`Store:          ${storeName}`);
  console.log(`Bucket size:    ${bucketSize} (initial) / ${fullRefillTest.requestsBeforeLimit} (after 60s refill)`);
  console.log(`Leak rate:      ~${avgLeakRate.toFixed(1)} tokens/sec (avg across ${leakTests.length} measurements)`);
  console.log(`Leak tests:     ${leakTests.map(t => `${t.waitSec}s→${t.refilled} tokens (${t.leakRate.toFixed(1)}/s)`).join(', ')}`);
  console.log(`Safe req rate:  ~${Math.floor(avgLeakRate * 0.8)} req/sec/IP (80% of leak rate)`);
  console.log();

  // Machine-readable output
  const result = {
    store: storeName,
    bucketSize,
    bucketSizeAfterRefill: fullRefillTest.requestsBeforeLimit,
    avgLeakRate: Math.round(avgLeakRate * 10) / 10,
    leakTests: leakTests.map(t => ({ waitSec: t.waitSec, refilled: t.refilled, rate: Math.round(t.leakRate * 10) / 10 })),
    safeRate: Math.floor(avgLeakRate * 0.8),
  };
  console.log('JSON:', JSON.stringify(result));
}

main().catch(console.error);
