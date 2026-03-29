/**
 * Test script: validates discovery (sitemap) + extraction (.js endpoint) for each store
 *
 * Tests:
 * 1. Sitemap fetch — can we reach the sitemap index?
 * 2. Product sitemap parse — can we extract product handles?
 * 3. Language prefix filtering — are non-English sitemaps excluded?
 * 4. Product .js fetch — can we fetch and parse a product page?
 * 5. Collection validation — does the HEAD check work?
 *
 * Usage: node scripts/test-store-discovery-extraction.mjs
 */

const stores = [
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
  {
    name: 'black-knight-games',
    baseUrl: 'https://blackknightgames.ca',
    collectionSlug: 'mtg-singles-all-products',
  },
  {
    name: 'exor-games',
    baseUrl: 'https://exorgames.com',
    collectionSlug: 'magic-the-gathering-singles',
  },
  {
    name: 'game-knight',
    baseUrl: 'https://gameknight.ca',
    collectionSlug: 'mtg-singles-all-products',
  },
  {
    name: 'the-cg-realm',
    baseUrl: 'https://www.thecgrealm.com',
    collectionSlug: 'mtg-singles-all-products',
  },
];

const TIMEOUT = 30000;
const UA = 'Mozilla/5.0 (compatible; ScoutLGS/1.0; +https://scoutlgs.com)';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || TIMEOUT);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { 'User-Agent': UA, ...(options.headers || {}) },
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ── Test 1: Sitemap index fetch + language prefix analysis ───────────────────

async function testSitemapDiscovery(store) {
  const results = { store: store.name, sitemapOk: false, productSitemaps: 0, filteredSitemaps: 0, langPrefixes: [], sampleHandles: [], error: null };

  try {
    const res = await fetchWithTimeout(`${store.baseUrl}/sitemap.xml`);
    if (!res.ok) {
      results.error = `Sitemap HTTP ${res.status}`;
      return results;
    }
    results.sitemapOk = true;

    const xml = await res.text();

    // Extract all product sitemap URLs
    const allMatches = [...xml.matchAll(/<loc>([^<]*sitemap_products[^<]*)<\/loc>/g)].map(m => m[1]);
    results.productSitemaps = allMatches.length;

    // Check for language prefixes
    const prefixSet = new Set();
    for (const url of allMatches) {
      try {
        const pathname = new URL(url).pathname;
        if (!pathname.startsWith('/sitemap_products')) {
          const prefix = pathname.split('/sitemap_products')[0];
          prefixSet.add(prefix);
        }
      } catch { /* ignore */ }
    }
    results.langPrefixes = [...prefixSet];

    // Filter to root-level only (no language prefix)
    const filtered = allMatches.filter(url => {
      try {
        return new URL(url).pathname.startsWith('/sitemap_products');
      } catch { return false; }
    });
    results.filteredSitemaps = filtered.length;

    // Parse first sitemap page to get sample handles
    if (filtered.length > 0) {
      try {
        const sitemapRes = await fetchWithTimeout(filtered[0]);
        if (sitemapRes.ok) {
          const sitemapXml = await sitemapRes.text();
          const urlMatches = [...sitemapXml.matchAll(/<loc>([^<]+\/products\/[^<]+)<\/loc>/g)];
          const handles = urlMatches
            .map(m => m[1].match(/\/products\/([^/?#]+)/)?.[1])
            .filter(Boolean);
          results.sampleHandles = handles.slice(0, 5);
        }
      } catch (e) {
        results.error = `Sitemap page parse error: ${e.message}`;
      }
    }
  } catch (e) {
    results.error = e.name === 'AbortError' ? 'Timeout' : e.message;
  }

  return results;
}

// ── Test 2: Product .js extraction ───────────────────────────────────────────

async function testExtraction(store, handle) {
  const results = { store: store.name, handle, fetchOk: false, title: null, variants: 0, sampleVariant: null, error: null };

  const url = `${store.baseUrl}/products/${handle}.js`;
  try {
    const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } });

    if (!res.ok) {
      results.error = `HTTP ${res.status} for ${url}`;
      return results;
    }

    results.fetchOk = true;
    const product = await res.json();
    results.title = product.title;
    results.variants = product.variants?.length || 0;

    if (product.variants?.length > 0) {
      const v = product.variants[0];
      results.sampleVariant = {
        id: v.id,
        title: v.title,
        price: `$${(v.price / 100).toFixed(2)}`,
        available: v.available,
        sku: v.sku || null,
        option1: v.option1 || null,
      };
    }
  } catch (e) {
    results.error = e.name === 'AbortError' ? 'Timeout' : e.message;
  }

  return results;
}

// ── Test 3: Collection validation (HEAD request) ─────────────────────────────

async function testCollectionValidation(store, handle) {
  const collectionUrl = `${store.baseUrl}/collections/${store.collectionSlug}/products/${handle}`;
  const results = { store: store.name, handle, collectionUrl, status: null, inCollection: false, error: null };

  try {
    const res = await fetchWithTimeout(collectionUrl, { redirect: 'manual' });
    results.status = res.status;
    results.inCollection = res.status === 200;
  } catch (e) {
    results.error = e.name === 'AbortError' ? 'Timeout' : e.message;
  }

  return results;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(80));
  console.log('Store Discovery & Extraction Test');
  console.log('='.repeat(80));
  console.log();

  // Phase 1: Sitemap discovery
  console.log('── Phase 1: Sitemap Discovery ──────────────────────────────────');
  console.log();

  const discoveryResults = await Promise.all(stores.map(s => testSitemapDiscovery(s)));

  for (const r of discoveryResults) {
    const status = r.sitemapOk ? '✓' : '✗';
    const langNote = r.langPrefixes.length > 0
      ? ` (${r.langPrefixes.length} lang prefixes: ${r.langPrefixes.join(', ')})`
      : '';
    console.log(`${status} ${r.store}`);
    console.log(`  Sitemap: ${r.sitemapOk ? 'OK' : 'FAIL'}`);
    console.log(`  Total product sitemaps: ${r.productSitemaps}${langNote}`);
    console.log(`  After filtering (root only): ${r.filteredSitemaps}`);
    console.log(`  Est. products: ~${r.filteredSitemaps * 5000}`);
    if (r.sampleHandles.length > 0) {
      console.log(`  Sample handles: ${r.sampleHandles.slice(0, 3).join(', ')}`);
    }
    if (r.error) console.log(`  ERROR: ${r.error}`);
    console.log();
  }

  // Phase 2: Product extraction (use first sample handle from each store)
  console.log('── Phase 2: Product .js Extraction ─────────────────────────────');
  console.log();

  const extractionResults = [];
  for (const r of discoveryResults) {
    if (r.sampleHandles.length > 0) {
      const result = await testExtraction(
        stores.find(s => s.name === r.store),
        r.sampleHandles[0],
      );
      extractionResults.push(result);
    } else {
      extractionResults.push({ store: r.store, error: 'No sample handles from discovery' });
    }
  }

  for (const r of extractionResults) {
    const status = r.fetchOk ? '✓' : '✗';
    console.log(`${status} ${r.store} — ${r.handle || 'N/A'}`);
    if (r.fetchOk) {
      console.log(`  Title: ${r.title}`);
      console.log(`  Variants: ${r.variants}`);
      if (r.sampleVariant) {
        console.log(`  Sample: ${r.sampleVariant.title} — ${r.sampleVariant.price} (${r.sampleVariant.available ? 'in stock' : 'out of stock'})`);
        console.log(`  SKU: ${r.sampleVariant.sku || 'none'} | Option1: ${r.sampleVariant.option1 || 'none'}`);
      }
    }
    if (r.error) console.log(`  ERROR: ${r.error}`);
    console.log();
  }

  // Phase 3: Collection validation (confirm handle is in MTG singles collection)
  console.log('── Phase 3: Collection Validation (HEAD) ───────────────────────');
  console.log();

  const validationResults = [];
  for (const r of discoveryResults) {
    if (r.sampleHandles.length > 0) {
      const result = await testCollectionValidation(
        stores.find(s => s.name === r.store),
        r.sampleHandles[0],
      );
      validationResults.push(result);
    } else {
      validationResults.push({ store: r.store, error: 'No handle to validate' });
    }
  }

  for (const r of validationResults) {
    const status = r.inCollection ? '✓' : '✗';
    console.log(`${status} ${r.store} — ${r.handle || 'N/A'}`);
    console.log(`  Status: ${r.status || 'N/A'} | In collection: ${r.inCollection}`);
    if (r.error) console.log(`  ERROR: ${r.error}`);
    console.log();
  }

  // Summary
  console.log('── Summary ─────────────────────────────────────────────────────');
  console.log();
  const discoveryOk = discoveryResults.filter(r => r.sitemapOk).length;
  const extractionOk = extractionResults.filter(r => r.fetchOk).length;
  const validationOk = validationResults.filter(r => r.inCollection).length;
  console.log(`Discovery:  ${discoveryOk}/${stores.length} stores OK`);
  console.log(`Extraction: ${extractionOk}/${stores.length} stores OK`);
  console.log(`Validation: ${validationOk}/${stores.length} stores in collection`);

  const failed = stores.filter((_, i) => !discoveryResults[i].sitemapOk || !extractionResults[i].fetchOk);
  if (failed.length > 0) {
    console.log(`\nFailed stores: ${failed.map(s => s.name).join(', ')}`);
  }
}

main().catch(console.error);
