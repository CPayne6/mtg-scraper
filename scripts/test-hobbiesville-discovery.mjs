/**
 * Diagnostic script: Why is Hobbiesville discovery marking all URLs as invalid?
 *
 * Tests the full discovery pipeline for Hobbiesville:
 * 1. Fetches sitemap index from /sitemap.xml
 * 2. Finds and parses product sitemaps
 * 3. Extracts product handles
 * 4. Tests HEAD validation against /collections/magic-singles/products/{handle}
 * 5. Tests alternative URL patterns to find what works
 */

const BASE_URL = 'https://www.hobbiesville.ca';
const COLLECTION_SLUG = 'magic-singles';
const USER_AGENT = 'Mozilla/5.0 (compatible; ScoutLGS/1.0; +https://scoutlgs.com)';
const SAMPLE_SIZE = 10; // Number of products to test

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

  // Extract ALL sitemap URLs
  const allSitemaps = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  console.log(`  Total sitemaps found: ${allSitemaps.length}`);

  // Show all sitemaps for debugging
  console.log('\n  All sitemaps:');
  for (const url of allSitemaps) {
    const isProduct = url.includes('sitemap_products');
    console.log(`    ${isProduct ? '✓' : '·'} ${url}`);
  }

  // Filter for product sitemaps (what the adapter does)
  const productSitemaps = allSitemaps.filter(url => url.includes('sitemap_products'));
  console.log(`\n  Product sitemaps: ${productSitemaps.length}`);

  // Further filter by pathname (what the adapter does — removes language-prefixed ones)
  const filtered = productSitemaps.filter(url => {
    const pathname = new URL(url).pathname;
    return pathname.startsWith('/sitemap_products');
  });

  if (filtered.length < productSitemaps.length) {
    console.log(`  After language filter: ${filtered.length} (removed ${productSitemaps.length - filtered.length} language-prefixed)`);
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

  // Also test with GET to see if it follows redirect
  const getResult = await fetchWithInfo(collectionUrl, { redirect: 'follow' });
  if (getResult.res) {
    const text = await getResult.res.text();
    const titleMatch = text.match(/<title>([^<]*)<\/title>/i);
    console.log(`  [Collection GET follow] Final status: ${getResult.status}, title: ${titleMatch?.[1]?.trim() || 'N/A'}`);
  }

  // Try alternative collection slugs
  const alternativeSlugs = [
    'magic-singles',
    'magic-the-gathering-singles',
    'mtg-singles',
    'magic-the-gathering',
    'mtg',
    'mtg-singles-all-products',
  ];

  console.log('\n  Testing alternative collection slugs:');
  for (const slug of alternativeSlugs) {
    const url = `${BASE_URL}/collections/${slug}`;
    const r = await fetchWithInfo(url);
    const marker = r.status === 200 ? '✓' : '✗';
    const loc = r.location ? ` → ${r.location}` : '';
    console.log(`    ${marker} /collections/${slug} → ${r.status || r.error}${loc}`);
  }

  // Try fetching collections.json to see what collections exist
  console.log('\n  Fetching collections.json to find available collections...');
  try {
    const res = await fetch(`${BASE_URL}/collections.json`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const data = await res.json();
      console.log(`    Found ${data.collections?.length || 0} collections:`);
      for (const c of (data.collections || []).slice(0, 20)) {
        const isMtg = c.title?.toLowerCase().includes('magic') || c.handle?.toLowerCase().includes('mtg') || c.handle?.toLowerCase().includes('magic');
        const marker = isMtg ? '  ← MTG?' : '';
        console.log(`      ${c.handle} — "${c.title}" (${c.products_count || '?'} products)${marker}`);
      }
      if ((data.collections?.length || 0) > 20) {
        console.log(`      ... and ${data.collections.length - 20} more`);
        // Show MTG-related ones from the rest
        const rest = data.collections.slice(20);
        const mtgCollections = rest.filter(c =>
          c.title?.toLowerCase().includes('magic') ||
          c.handle?.toLowerCase().includes('mtg') ||
          c.handle?.toLowerCase().includes('magic')
        );
        if (mtgCollections.length > 0) {
          console.log('      MTG-related collections beyond first 20:');
          for (const c of mtgCollections) {
            console.log(`        ${c.handle} — "${c.title}" (${c.products_count || '?'} products)`);
          }
        }
      }
    } else {
      console.log(`    collections.json returned ${res.status}`);
    }
  } catch (err) {
    console.log(`    Failed to fetch collections.json: ${err.message}`);
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

    // Test 1: Collection URL (what the adapter does)
    const collectionUrl = `${BASE_URL}/collections/${COLLECTION_SLUG}/products/${handle}`;
    const collResult = await fetchWithInfo(collectionUrl, { method: 'HEAD' });
    const isValid = collResult.status === 200;
    if (isValid) validCount++;
    else invalidCount++;

    console.log(`    Collection HEAD (${COLLECTION_SLUG}): ${collResult.status || collResult.error}${collResult.location ? ` → ${collResult.location}` : ''} ${isValid ? '✓ VALID' : '✗ INVALID'}`);

    // Test 2: Direct product URL (without collection)
    const directUrl = `${BASE_URL}/products/${handle}`;
    const directResult = await fetchWithInfo(directUrl, { method: 'HEAD' });
    console.log(`    Direct HEAD (/products/${handle}): ${directResult.status || directResult.error}${directResult.location ? ` → ${directResult.location}` : ''}`);

    // Test 3: Collection URL with GET (follow redirects)
    const getResult = await fetchWithInfo(collectionUrl, { method: 'GET', redirect: 'follow' });
    if (getResult.res) {
      const body = await getResult.res.text();
      const has404 = body.includes('404') || body.includes('not found') || body.includes('Page not found');
      console.log(`    Collection GET (follow): ${getResult.status}, contains 404/not-found: ${has404}`);
    }

    // Test 4: Direct product URL with GET (follow redirects)
    const directGetResult = await fetchWithInfo(directUrl, { method: 'GET', redirect: 'follow' });
    if (directGetResult.res) {
      const body = await directGetResult.res.text();
      const titleMatch = body.match(/<title>([^<]*)<\/title>/i);
      console.log(`    Direct GET (follow): ${directGetResult.status}, title: ${titleMatch?.[1]?.trim().slice(0, 80) || 'N/A'}`);
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
        // Check which collections this product belongs to via tags
        if (data.tags?.length) {
          const collectionTags = data.tags.filter(t =>
            t.toLowerCase().includes('magic') || t.toLowerCase().includes('mtg') || t.toLowerCase().includes('singles')
          );
          if (collectionTags.length > 0) {
            console.log(`    Relevant tags: ${collectionTags.join(', ')}`);
          }
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

// ─── Step 6: Summary & Diagnosis ───────────────────────────────────

function printDiagnosis(sitemapCount, handleCount, validResults) {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('DIAGNOSIS SUMMARY');
  console.log('═══════════════════════════════════════════════════════════\n');

  if (sitemapCount === 0) {
    console.log('  ISSUE: No product sitemaps found!');
    console.log('  → Hobbiesville sitemap.xml may not contain sitemap_products entries');
    console.log('  → Or the sitemap structure is different from standard Shopify');
  }

  if (handleCount === 0) {
    console.log('  ISSUE: No product handles extracted!');
    console.log('  → Product URLs in sitemap may not match /products/{handle} pattern');
  }

  console.log('\n  Check the output above for:');
  console.log('  1. Does the collection /collections/magic-singles return 200?');
  console.log('  2. Do collection+product URLs (/collections/magic-singles/products/{handle}) return 200 or redirect?');
  console.log('  3. Do direct product URLs (/products/{handle}) work?');
  console.log('  4. If collection URLs redirect but direct URLs work, the collection slug is wrong');
  console.log('  5. If both redirect, Hobbiesville may have a non-standard URL structure');
}

// ─── Main ──────────────────────────────────────────────────────────

async function main() {
  console.log('╔═════════════════════════════════════════════════════════╗');
  console.log('║  Hobbiesville Discovery Diagnostic                     ║');
  console.log('║  Base URL:   https://www.hobbiesville.ca               ║');
  console.log(`║  Collection: ${COLLECTION_SLUG.padEnd(42)}║`);
  console.log('╚═════════════════════════════════════════════════════════╝\n');

  // Step 1: Sitemap
  const sitemapUrls = await fetchSitemapIndex();
  if (sitemapUrls.length === 0) {
    console.log('FATAL: No product sitemaps found. Cannot continue.\n');
    printDiagnosis(0, 0);
    return;
  }

  // Step 2: Parse first product sitemap
  const handles = await parseSitemap(sitemapUrls[0]);
  if (handles.length === 0) {
    console.log('FATAL: No product handles found. Cannot continue.\n');
    printDiagnosis(sitemapUrls.length, 0);
    return;
  }

  // If multiple sitemaps, note total count
  if (sitemapUrls.length > 1) {
    console.log(`  Note: Only parsed first sitemap. ${sitemapUrls.length - 1} more sitemaps exist.\n`);
  }

  // Step 3: Test collection page
  await testCollectionPage();

  // Step 4: Validate sample products
  await validateProducts(handles);

  // Step 5: Test .js endpoints
  await testProductJson(handles);

  // Step 6: Summary
  printDiagnosis(sitemapUrls.length, handles.length);
}

main().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
