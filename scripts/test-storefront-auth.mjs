#!/usr/bin/env node

/**
 * Test script for Shopify Storefront API with Web Bot Auth
 *
 * Tests:
 *   1. Tokenless Storefront API access (shop query + products query)
 *   2. Collection-based product query
 *   3. Ed25519 key generation and RFC 9421 request signing
 *   4. Signed vs unsigned response comparison
 *
 * Usage:
 *   node scripts/test-storefront-auth.mjs
 *   node scripts/test-storefront-auth.mjs --store=exor-games
 */

import * as crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Store registry (from seed.ts)
// ---------------------------------------------------------------------------
const STORES = {
  'game-knight': {
    displayName: 'Game Knight',
    shopifyUrl: 'gameknight-games.myshopify.com',
    collection: 'mtg-singles-all-products',
  },
  'house-of-cards': {
    displayName: 'House of Cards',
    shopifyUrl: 'house-of-cards-mtg.myshopify.com',
    collection: 'mtg-singles-all-products',
  },
  'black-knight-games': {
    displayName: 'Black Knight Games',
    shopifyUrl: 'black-knight-games.myshopify.com',
    collection: 'mtg-singles-all-products',
  },
  'exor-games': {
    displayName: 'Exor Games',
    shopifyUrl: 'most-wanted-ca.myshopify.com',
    collection: 'magic-the-gathering-singles',
  },
  'the-cg-realm': {
    displayName: 'The CG Realm',
    shopifyUrl: 'the-cg-realm.myshopify.com',
    collection: 'mtg-singles-all-products',
  },
};

const API_VERSION = '2025-07';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);

const storeKey = args.store || 'game-knight';
const store = STORES[storeKey];
if (!store) {
  console.error(`Unknown store "${storeKey}". Available: ${Object.keys(STORES).join(', ')}`);
  process.exit(1);
}

const ENDPOINT = `https://${store.shopifyUrl}/api/${API_VERSION}/graphql.json`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function section(title) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${title}`);
  console.log(`${'='.repeat(70)}\n`);
}

function subsection(title) {
  console.log(`\n--- ${title} ---\n`);
}

function logHeaders(headers) {
  const interesting = [
    'x-request-id',
    'x-shopify-stage',
    'retry-after',
    'x-robots-tag',
    'cf-ray',
    'content-type',
    'x-sorting-hat-shopid',
    'x-sorting-hat-section',
    'x-dc',
    'x-shardid',
    'x-shopid',
    'x-stats-userid',
    'x-permitted-cross-domain-policies',
    'strict-transport-security',
  ];

  console.log('Response headers (selected):');
  for (const [key, value] of headers.entries()) {
    if (interesting.includes(key) || key.startsWith('x-shopify') || key.startsWith('x-request')) {
      console.log(`  ${key}: ${value}`);
    }
  }

  // Also log any rate-limit-related headers
  for (const [key, value] of headers.entries()) {
    if (key.includes('rate') || key.includes('limit') || key.includes('retry') || key.includes('throttl')) {
      console.log(`  [rate-limit] ${key}: ${value}`);
    }
  }
}

async function sendQuery(query, variables = {}, extraHeaders = {}) {
  const body = JSON.stringify({ query, variables });
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body,
  });

  const status = res.status;
  const headers = res.headers;
  let data;
  try {
    data = await res.json();
  } catch {
    data = { _rawText: await res.text().catch(() => '(unreadable)') };
  }

  return { status, headers, data };
}

// ---------------------------------------------------------------------------
// GraphQL queries
// ---------------------------------------------------------------------------
const SHOP_QUERY = `{ shop { name } }`;

const PRODUCTS_QUERY = `{
  products(first: 2) {
    edges {
      node {
        handle
        title
        vendor
        productType
        tags
        availableForSale
        variants(first: 3) {
          edges {
            node {
              id
              title
              sku
              availableForSale
              price { amount currencyCode }
              selectedOptions { name value }
            }
          }
        }
      }
    }
  }
}`;

function collectionQuery(slug) {
  return `{
  collection(handle: "${slug}") {
    title
    handle
    products(first: 5) {
      edges {
        node {
          handle
          title
          tags
          productType
          vendor
          availableForSale
          variants(first: 3) {
            edges {
              node {
                title
                sku
                availableForSale
                price { amount currencyCode }
                selectedOptions { name value }
              }
            }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;
}

// ---------------------------------------------------------------------------
// RFC 9421 signing helpers
// ---------------------------------------------------------------------------

/**
 * Build an RFC 9421 signature base string for a POST request.
 *
 * Covered components:
 *   "@method"        - POST
 *   "@target-uri"    - full URL
 *   "content-type"   - application/json
 *   "content-digest" - SHA-256 of the body
 *
 * See: https://www.rfc-editor.org/rfc/rfc9421
 */
function buildSignatureBase(method, url, contentType, contentDigest, params) {
  const components = [
    [`"@method"`, method.toUpperCase()],
    [`"@target-uri"`, url],
    [`"content-type"`, contentType],
    [`"content-digest"`, contentDigest],
  ];

  const lines = components.map(([name, value]) => `${name}: ${value}`);
  const componentList = components.map(([name]) => name).join(' ');
  const paramsStr = `(${componentList});created=${params.created};keyid="${params.keyid}";alg="ed25519"`;

  lines.push(`"@signature-params": ${paramsStr}`);

  return { base: lines.join('\n'), params: paramsStr };
}

/**
 * Compute Content-Digest header value (SHA-256 of body).
 * Format: sha-256=:base64:
 */
function contentDigest(body) {
  const hash = crypto.createHash('sha256').update(body).digest('base64');
  return `sha-256=:${hash}:`;
}

function signEd25519(privateKey, data) {
  return crypto.sign(null, Buffer.from(data, 'utf-8'), privateKey);
}

// ---------------------------------------------------------------------------
// Test 1: Tokenless shop query
// ---------------------------------------------------------------------------
async function testShopQuery() {
  section(`Test 1: Tokenless shop query (${store.displayName})`);
  console.log(`Endpoint: ${ENDPOINT}`);
  console.log(`Query: { shop { name } }\n`);

  const { status, headers, data } = await sendQuery(SHOP_QUERY);

  console.log(`Status: ${status}`);
  logHeaders(headers);
  subsection('Response body');
  console.log(JSON.stringify(data, null, 2));

  if (data.extensions) {
    subsection('Extensions (cost info)');
    console.log(JSON.stringify(data.extensions, null, 2));
  }

  return { status, data };
}

// ---------------------------------------------------------------------------
// Test 2: Tokenless products query
// ---------------------------------------------------------------------------
async function testProductsQuery() {
  section(`Test 2: Tokenless products query (first 2)`);

  const { status, headers, data } = await sendQuery(PRODUCTS_QUERY);

  console.log(`Status: ${status}`);
  logHeaders(headers);
  subsection('Response body');
  console.log(JSON.stringify(data, null, 2));

  // Check if tags are populated
  const products = data?.data?.products?.edges || [];
  if (products.length > 0) {
    subsection('Tag analysis');
    for (const edge of products) {
      const node = edge.node;
      console.log(`  "${node.title}" - tags: ${node.tags?.length ? node.tags.join(', ') : '(empty)'}`);
    }
  }

  return { status, data };
}

// ---------------------------------------------------------------------------
// Test 3: Collection query
// ---------------------------------------------------------------------------
async function testCollectionQuery() {
  section(`Test 3: Collection query ("${store.collection}")`);

  const { status, headers, data } = await sendQuery(collectionQuery(store.collection));

  console.log(`Status: ${status}`);
  logHeaders(headers);
  subsection('Response body');
  console.log(JSON.stringify(data, null, 2));

  const collection = data?.data?.collection;
  if (collection) {
    subsection('Collection info');
    console.log(`  Title: ${collection.title}`);
    console.log(`  Handle: ${collection.handle}`);

    const products = collection.products?.edges || [];
    subsection('Products found');
    for (const edge of products) {
      const node = edge.node;
      const variantCount = node.variants?.edges?.length ?? 0;
      console.log(`  "${node.title}" (${variantCount} variant(s))`);
      console.log(`    tags: ${node.tags?.length ? node.tags.join(', ') : '(empty)'}`);
      for (const v of node.variants?.edges || []) {
        const vn = v.node;
        console.log(
          `    variant: "${vn.title}" | $${vn.price?.amount} ${vn.price?.currencyCode} | sku=${vn.sku || '(none)'} | qty=${vn.quantityAvailable ?? '?'}`,
        );
        if (vn.selectedOptions?.length) {
          console.log(`      options: ${vn.selectedOptions.map((o) => `${o.name}=${o.value}`).join(', ')}`);
        }
      }
    }

    const pageInfo = collection.products?.pageInfo;
    if (pageInfo) {
      console.log(`\n  hasNextPage: ${pageInfo.hasNextPage}`);
      console.log(`  endCursor: ${pageInfo.endCursor}`);
    }
  }

  return { status, data };
}

// ---------------------------------------------------------------------------
// Test 4: Ed25519 key generation and signed request
// ---------------------------------------------------------------------------
async function testSignedRequest() {
  section('Test 4: Ed25519 key generation and signed request');

  // Generate keypair
  subsection('Generating Ed25519 keypair');
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');

  const pubKeyDer = publicKey.export({ type: 'spki', format: 'der' });
  const pubKeyBase64 = pubKeyDer.toString('base64');
  const pubKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
  console.log('Public key (PEM):');
  console.log(pubKeyPem);
  console.log(`Public key (base64 DER): ${pubKeyBase64}`);
  console.log(`Key ID: test-bot-${Date.now()}`);

  // Build signed request
  subsection('Building signed request');
  const body = JSON.stringify({ query: SHOP_QUERY });
  const method = 'POST';
  const digest = contentDigest(body);
  const keyId = `test-bot-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);

  console.log(`Content-Digest: ${digest}`);
  console.log(`Created: ${created}`);

  const { base, params } = buildSignatureBase(method, ENDPOINT, 'application/json', digest, {
    created,
    keyid: keyId,
  });

  console.log('\nSignature base string:');
  console.log(base);

  const signature = signEd25519(privateKey, base);
  const sigBase64 = signature.toString('base64');
  console.log(`\nSignature (base64): ${sigBase64.substring(0, 40)}...`);

  // Construct the three Web Bot Auth headers
  const headers = {
    'Content-Type': 'application/json',
    'Content-Digest': digest,
    'Signature-Input': `sig1=${params}`,
    'Signature': `sig1=:${sigBase64}:`,
  };

  console.log('\nRequest headers:');
  for (const [k, v] of Object.entries(headers)) {
    console.log(`  ${k}: ${v}`);
  }

  // Send signed request
  subsection('Sending signed request');
  const { status, headers: resHeaders, data } = await sendQuery(SHOP_QUERY, {}, {
    'Content-Digest': digest,
    'Signature-Input': `sig1=${params}`,
    'Signature': `sig1=:${sigBase64}:`,
  });

  console.log(`Status: ${status}`);
  logHeaders(resHeaders);
  subsection('Response body');
  console.log(JSON.stringify(data, null, 2));

  return { status, data, pubKeyBase64 };
}

// ---------------------------------------------------------------------------
// Test 5: Rapid-fire requests to probe rate limiting
// ---------------------------------------------------------------------------
async function testRateLimits() {
  section('Test 5: Rate limit probing (5 rapid requests)');

  const results = [];
  for (let i = 0; i < 5; i++) {
    const start = Date.now();
    const { status, headers, data } = await sendQuery(SHOP_QUERY);
    const elapsed = Date.now() - start;

    const cost = data?.extensions?.cost;
    const retryAfter = headers.get('retry-after');

    results.push({ i: i + 1, status, elapsed, cost, retryAfter });
    console.log(
      `  Request ${i + 1}: status=${status} time=${elapsed}ms` +
        (retryAfter ? ` retry-after=${retryAfter}` : '') +
        (cost ? ` requestedCost=${cost.requestedQueryCost} actualCost=${cost.actualQueryCost} remaining=${cost.throttleStatus?.currentlyAvailable}` : ''),
    );
  }

  subsection('Rate limit summary');
  const throttled = results.filter((r) => r.status === 429 || r.retryAfter);
  console.log(`  Total requests: ${results.length}`);
  console.log(`  Throttled: ${throttled.length}`);
  if (results[0]?.cost?.throttleStatus) {
    const ts = results[0].cost.throttleStatus;
    console.log(`  Max available: ${ts.maximumAvailable}`);
    console.log(`  Restore rate: ${ts.restoreRate}/s`);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
function printSummary(results) {
  section('SUMMARY OF FINDINGS');

  const { shopResult, productsResult, collectionResult, signedResult } = results;

  console.log(`Store: ${store.displayName} (${store.shopifyUrl})`);
  console.log(`API Version: ${API_VERSION}`);
  console.log(`Endpoint: ${ENDPOINT}`);
  console.log('');

  // Tokenless access
  const tokenlessWorks = shopResult?.status === 200 && !!shopResult?.data?.data?.shop;
  console.log(`Tokenless access: ${tokenlessWorks ? 'YES - works' : 'NO - blocked (status ' + shopResult?.status + ')'}`);

  // Shop name
  if (shopResult?.data?.data?.shop?.name) {
    console.log(`Shop name: ${shopResult.data.data.shop.name}`);
  }

  // Products available
  const products = productsResult?.data?.data?.products?.edges || [];
  console.log(`Products query: ${products.length > 0 ? 'YES - returns data' : 'NO data returned'}`);

  // Tags
  const hasTags = products.some((e) => e.node.tags?.length > 0);
  console.log(`Tags populated: ${hasTags ? 'YES' : 'NO - tags are empty'}`);

  // Collection
  const collection = collectionResult?.data?.data?.collection;
  const collectionProducts = collection?.products?.edges || [];
  console.log(`Collection query: ${collection ? `YES - collection found (${collectionProducts.length} products returned)` : 'NO - collection not found'}`);
  if (collection?.products?.pageInfo) {
    console.log(`Collection has more pages: ${collection.products.pageInfo.hasNextPage}`);
  }

  // Variant details
  const sampleProduct = collection?.products?.edges?.[0]?.node || products[0]?.node;
  const sampleVariant = sampleProduct?.variants?.edges?.[0]?.node;
  if (sampleVariant) {
    console.log(`Variant fields available: ${Object.keys(sampleVariant).join(', ')}`);
    console.log(`SKU populated: ${sampleVariant.sku ? 'YES' : 'NO'}`);
  }

  // Note about quantityAvailable
  console.log(`quantityAvailable: BLOCKED - requires unauthenticated_read_product_inventory scope`);

  // Cost / throttling
  const costData =
    shopResult?.data?.extensions?.cost ||
    productsResult?.data?.extensions?.cost ||
    collectionResult?.data?.extensions?.cost;
  if (costData) {
    console.log(`\nQuery cost info available: YES`);
    console.log(`  Throttle status: maxAvailable=${costData.throttleStatus?.maximumAvailable}, restoreRate=${costData.throttleStatus?.restoreRate}/s`);
  } else {
    console.log(`\nQuery cost info: NOT returned in extensions`);
  }

  // Signed request
  const signedOk = signedResult?.status === 200 && !!signedResult?.data?.data;
  const unsignedOk = tokenlessWorks;
  console.log(`\nSigned request status: ${signedResult?.status}`);
  console.log(`Signed request returned data: ${signedOk ? 'YES' : 'NO'}`);
  console.log(`Signing made a difference: ${signedOk === unsignedOk ? 'NO - same result as unsigned (both work tokenless)' : 'YES - different behavior'}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`\nStorefront API Test Script`);
  console.log(`Store: ${store.displayName} (${storeKey})`);
  console.log(`Endpoint: ${ENDPOINT}`);
  console.log(`Time: ${new Date().toISOString()}`);

  const results = {};

  try {
    results.shopResult = await testShopQuery();
  } catch (err) {
    console.error(`Shop query failed: ${err.message}`);
    results.shopResult = { status: 0, data: null };
  }

  try {
    results.productsResult = await testProductsQuery();
  } catch (err) {
    console.error(`Products query failed: ${err.message}`);
    results.productsResult = { status: 0, data: null };
  }

  try {
    results.collectionResult = await testCollectionQuery();
  } catch (err) {
    console.error(`Collection query failed: ${err.message}`);
    results.collectionResult = { status: 0, data: null };
  }

  try {
    results.signedResult = await testSignedRequest();
  } catch (err) {
    console.error(`Signed request test failed: ${err.message}`);
    results.signedResult = { status: 0, data: null };
  }

  try {
    await testRateLimits();
  } catch (err) {
    console.error(`Rate limit test failed: ${err.message}`);
  }

  printSummary(results);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
