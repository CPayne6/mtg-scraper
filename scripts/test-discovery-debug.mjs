/**
 * Discovery diagnostic script
 *
 * Tests the full discovery pipeline for a store:
 * 1. Fetches sitemap index from /sitemap.xml
 * 2. Finds and parses product sitemaps
 * 3. Extracts product handles
 * 4. Tests HEAD validation against /collections/{slug}/products/{handle}
 * 5. Tests alternative URL patterns to find what works
 *
 * Usage: node scripts/test-discovery-debug.mjs [storeName]
 *   Default: face-to-face-games
 */

const STORES = {
  'face-to-face-games': {
    baseUrl: 'https://www.facetofacegames.com',
    collectionSlug: 'magic-the-gathering-singles',
  },
  'hobbiesville': {
    baseUrl: 'https://hobbiesville.com',
    collectionSlug: 'magic-singles',
  },
  '401-games': {
    baseUrl: 'https://store.401games.ca',
    collectionSlug: 'magic-the-gathering-singles',
  },
};

const storeName = process.argv[2] || 'face-to-face-games';
const storeConfig = STORES[storeName];
if (!storeConfig) {
  console.error(`Unknown store: ${storeName}. Available: ${Object.keys(STORES).join(', ')}`);
  process.exit(1);
}

const BASE_URL = storeConfig.baseUrl;
const COLLECTION_SLUG = storeConfig.collectionSlug;
const USER_AGENT = 'Mozilla/5.0 (compatible; ScoutLGS/1.0; +https://scoutlgs.com)';
const SAMPLE_SIZE = 10;

// ─── Helpers ───────────────────────────────────────────────────────

async function fetchWithInfo(url, options = {}) {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      redirect: 'manual',
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(15000),
      ...options,
    });
    const elapsed = Date.now() - start;
    const location = res.headers.get('location');
    return { url, status: res.status, location, elapsed, error: null, res };
  } catch (err) {
    return { url, status: null, location: null, elapsed: Date.now() - start, error: err.message };
  }
}

function printResult(label, result) {
  const status = result.error
    ? `ERROR: ${result.error}`
    : `${result.status}${result.location ? ` → ${result.location}` : ''}`;
  console.log(`  [${label}] ${result.url}`);
  console.log(`    Status: ${status} (${result.elapsed}ms)`);
}

// ─── Step 1: Fetch Sitemap Index ───────────────────────────────────

async function fetchSitemapIndex() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('STEP 1: Fetching sitemap index');
  console.log('═══════════════════════════════════════════════════════════');

  const sitemapUrl = `${BASE_URL}/sitemap.xml`;
  console.log(`  URL: ${sitemapUrl}\n`);

  const res = await fetch(sitemapUrl, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    console.log(`  FAILED: HTTP ${res.status}`);
    return [];
  }

  const xml = await res.text();
  console.log(`  Response size: ${xml.length} bytes`);

  // Extract ALL sitemap URLs — handle &amp; in XML
  const allSitemaps = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].replace(/&amp;/g, '&'));
  console.log(`  Total sitemaps found: ${allSitemaps.length}`);

  // Show all sitemaps (cap at 20 for readability)
  console.log('\n  Sitemaps:');
  const displayLimit = 20;
  for (const url of allSitemaps.slice(0, displayLimit)) {
    const isProduct = url.includes('sitemap_products');
    console.log(`    ${isProduct ? '✓' : '·'} ${url}`);
  }
  if (allSitemaps.length > displayLimit) {
    console.log(`    ... and ${allSitemaps.length - displayLimit} more`);
  }

  // Filter for product sitemaps (what the adapter does)
  const productSitemaps = allSitemaps.filter(url => url.includes('sitemap_products'));
  console.log(`\n  Product sitemaps: ${productSitemaps.length}`);

  // Further filter by pathname (adapter removes language-prefixed ones)
  const filtered = productSitemaps.filter(url => {
    try {
      const pathname = new URL(url).pathname;
      return pathname.startsWith('/sitemap_products');
    } catch {
      return false;
    }
  });

  if (filtered.length < productSitemaps.length) {
    console.log(`  After language filter: ${filtered.length} (removed ${productSitemaps.length - filtered.length} language-prefixed)`);
  }

  // Check: do sitemap URLs use the same domain as BASE_URL?
  if (filtered.length > 0) {
    const sitemapHost = new URL(filtered[0]).host;
    const baseHost = new URL(BASE_URL).host;
    if (sitemapHost !== baseHost) {
      console.log(`\n  ⚠ DOMAIN MISMATCH: sitemap uses "${sitemapHost}" but baseUrl uses "${baseHost}"`);
    }
  }

  console.log('');
  return filtered;
}

// ─── Step 2: Parse Product Sitemap ─────────────────────────────────

async function parseSitemap(sitemapUrl) {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('STEP 2: Parsing product sitemap');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  URL: ${sitemapUrl}\n`);

  const res = await fetch(sitemapUrl, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    console.log(`  FAILED: HTTP ${res.status}`);
    return [];
  }

  const xml = await res.text();
  console.log(`  Response size: ${xml.length} bytes`);

  const entries = [];
  const urlMatches = xml.matchAll(/<url>([\s\S]*?)<\/url>/g);

  for (const urlMatch of urlMatches) {
    const urlContent = urlMatch[1];
    const locMatch = urlContent.match(/<loc>([^<]+)<\/loc>/);
    if (!locMatch) continue;

    const loc = locMatch[1];
    const lastmodMatch = urlContent.match(/<lastmod>([^<]+)<\/lastmod>/);

    entries.push({
      loc,
      lastmod: lastmodMatch?.[1],
      isProduct: loc.includes('/products/'),
    });
  }

  const productEntries = entries.filter(e => e.isProduct);
  const nonProductEntries = entries.filter(e => !e.isProduct);

  console.log(`  Total entries: ${entries.length}`);
  console.log(`  Product entries: ${productEntries.length}`);
  console.log(`  Non-product entries: ${nonProductEntries.length}`);

  if (nonProductEntries.length > 0) {
    console.log(`\n  Sample non-product URLs:`);
    for (const e of nonProductEntries.slice(0, 5)) {
      console.log(`    ${e.loc}`);
    }
  }

  // Extract handles
  const handles = [];
  for (const entry of productEntries) {
    const match = entry.loc.match(/\/products\/([^/?#]+)/);
    if (match) {
      handles.push({ handle: match[1], loc: entry.loc, lastmod: entry.lastmod });
    }
  }

  console.log(`\n  Extracted handles: ${handles.length}`);
  if (handles.length > 0) {
    console.log(`\n  Sample product URLs and handles:`);
    for (const h of handles.slice(0, 5)) {
      console.log(`    ${h.loc}`);
      console.log(`      handle: ${h.handle}`);
    }
  }

  console.log('');
  return handles;
}

// ─── Step 3: Test Collection Page ──────────────────────────────────

async function testCollectionPage() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('STEP 3: Testing collection page accessibility');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Test the collection page itself
  const collectionUrl = `${BASE_URL}/collections/${COLLECTION_SLUG}`;
  const result = await fetchWithInfo(collectionUrl);
  printResult('Collection page', result);

  // Also test with GET following redirects
  const getResult = await fetchWithInfo(collectionUrl, { redirect: 'follow' });
  if (getResult.res) {
    const text = await getResult.res.text();
    const titleMatch = text.match(/<title>([^<]*)<\/title>/i);
    console.log(`  [Collection GET follow] Final status: ${getResult.status}, title: ${titleMatch?.[1]?.trim().slice(0, 100) || 'N/A'}`);
  }

  console.log('');
}

// ─── Step 4: Validate Sample Products ──────────────────────────────

async function validateProducts(handles) {
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`STEP 4: Validating ${SAMPLE_SIZE} sample products`);
  console.log('═══════════════════════════════════════════════════════════\n');

  const sample = handles.slice(0, SAMPLE_SIZE);

  let validCount = 0;
  let invalidCount = 0;

  for (const { handle, loc } of sample) {
    console.log(`  Product: ${handle}`);
    console.log(`    Sitemap URL: ${loc}`);

    // Test 1: Collection URL HEAD (what the adapter does)
    const collectionUrl = `${BASE_URL}/collections/${COLLECTION_SLUG}/products/${handle}`;
    const collResult = await fetchWithInfo(collectionUrl, { method: 'HEAD' });
    const isValid = collResult.status === 200;
    if (isValid) validCount++;
    else invalidCount++;

    console.log(`    Collection HEAD: ${collResult.status || collResult.error}${collResult.location ? ` → ${collResult.location}` : ''} ${isValid ? '✓ VALID' : '✗ INVALID'}`);

    // Test 2: Direct product URL HEAD
    const directUrl = `${BASE_URL}/products/${handle}`;
    const directResult = await fetchWithInfo(directUrl, { method: 'HEAD' });
    console.log(`    Direct HEAD:     ${directResult.status || directResult.error}${directResult.location ? ` → ${directResult.location}` : ''}`);

    // Test 3: Collection URL GET following redirects
    const getResult = await fetchWithInfo(collectionUrl, { method: 'GET', redirect: 'follow' });
    if (getResult.res) {
      const body = await getResult.res.text();
      const has404 = body.includes('404') || body.includes('not found') || body.includes('Page not found');
      console.log(`    Collection GET:  ${getResult.status}, 404 in body: ${has404}`);
    }

    console.log('');
  }

  console.log(`  Results: ${validCount} valid, ${invalidCount} invalid out of ${sample.length} tested`);
  console.log('');
}

// ─── Step 5: Test product .js endpoint ─────────────────────────────

async function testProductJson(handles) {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('STEP 5: Testing product .js JSON endpoints');
  console.log('═══════════════════════════════════════════════════════════\n');

  const sample = handles.slice(0, 3);

  for (const { handle } of sample) {
    const jsUrl = `${BASE_URL}/products/${handle}.js`;
    try {
      const res = await fetch(jsUrl, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const data = await res.json();
        console.log(`  ${handle}.js → 200 OK`);
        console.log(`    Title: ${data.title}`);
        console.log(`    Type: ${data.type}`);
        console.log(`    Vendor: ${data.vendor}`);
        console.log(`    Variants: ${data.variants?.length || 0}`);
        if (data.variants?.[0]) {
          console.log(`    First variant: ${data.variants[0].title} — $${(data.variants[0].price / 100).toFixed(2)}`);
        }
      } else {
        console.log(`  ${handle}.js → ${res.status}`);
      }
    } catch (err) {
      console.log(`  ${handle}.js → ERROR: ${err.message}`);
    }
    console.log('');
  }
}

// ─── Main ──────────────────────────────────────────────────────────

async function main() {
  console.log('╔═════════════════════════════════════════════════════════╗');
  console.log(`║  Discovery Diagnostic: ${storeName.padEnd(33)}║`);
  console.log(`║  Base URL:   ${BASE_URL.padEnd(42)}║`);
  console.log(`║  Collection: ${COLLECTION_SLUG.padEnd(42)}║`);
  console.log('╚═════════════════════════════════════════════════════════╝\n');

  // Step 1: Sitemap
  const sitemapUrls = await fetchSitemapIndex();
  if (sitemapUrls.length === 0) {
    console.log('FATAL: No product sitemaps found. Cannot continue.\n');
    return;
  }

  // Step 2: Parse first product sitemap
  const handles = await parseSitemap(sitemapUrls[0]);
  if (handles.length === 0) {
    console.log('FATAL: No product handles found. Cannot continue.\n');
    return;
  }

  if (sitemapUrls.length > 1) {
    console.log(`  Note: Only parsed first sitemap. ${sitemapUrls.length - 1} more sitemaps exist.\n`);
  }

  // Step 3: Test collection page
  await testCollectionPage();

  // Step 4: Validate sample products
  await validateProducts(handles);

  // Step 5: Test .js endpoints
  await testProductJson(handles);
}

main().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
