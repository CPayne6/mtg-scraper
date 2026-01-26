/**
 * Test script for BinderPOS stores with rate limiting detection
 *
 * This script tests the BinderPOS loader and parser through the proxy
 * with configurable concurrency to detect rate limiting issues.
 *
 * Proxy credentials are loaded from apps/scraper/.env
 *
 * Usage:
 *   pnpm run test:binderpos
 *
 * Environment variables:
 *   CARDS           - Comma-separated list of cards to test (default: "Lightning Bolt,Sol Ring,Llanowar Elves")
 *   CONCURRENCY     - Number of concurrent requests (default: 1)
 *   DELAY_MS        - Delay between batches in ms (default: 0)
 *   REPEAT          - Number of times to repeat the test (default: 1)
 *   STORES          - Comma-separated list of stores to test (default: all)
 *
 * Examples:
 *   # Basic test
 *   pnpm run test:binderpos
 *
 *   # Test rate limiting with high concurrency
 *   CONCURRENCY=10 REPEAT=3 pnpm run test:binderpos
 *
 *   # Test specific stores
 *   STORES=house-of-cards,exor-games pnpm run test:binderpos
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from scraper app directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import * as undici from 'undici';
import { BinderPOSLoader } from '../scraper/loaders/stores/BinderPOSLoader';
import { BinderPOSParser } from '../scraper/parsers/BinderPOSParser/BinderPOSParser';
import { ScrapeErrorType } from '../scraper/errors';

// BinderPOS stores configuration (from seed.ts)
const ALL_BINDERPOS_STORES = [
  {
    name: 'house-of-cards',
    displayName: 'House of Cards',
    baseUrl: 'https://houseofcards.ca',
    searchPath: 'mtg-advanced-search',
  },
  {
    name: 'black-knight-games',
    displayName: 'Black Knight Games',
    baseUrl: 'https://blackknightgames.ca',
    searchPath: 'magic-the-gathering-search',
  },
  {
    name: 'exor-games',
    displayName: 'Exor Games',
    baseUrl: 'https://exorgames.com',
    searchPath: 'advanced-search',
  },
  {
    name: 'game-knight',
    displayName: 'Game Knight',
    baseUrl: 'https://gameknight.ca',
    searchPath: 'magic-the-gathering-singles',
  },
];

// Default test cards
const DEFAULT_CARDS = ['Lightning Bolt', 'Sol Ring', 'Llanowar Elves'];

// Configuration from environment
const CONFIG = {
  cards: process.env.CARDS?.split(',').map((c) => c.trim()) ?? DEFAULT_CARDS,
  concurrency: parseInt(process.env.CONCURRENCY ?? '1', 10),
  delayMs: parseInt(process.env.DELAY_MS ?? '0', 10),
  repeat: parseInt(process.env.REPEAT ?? '1', 10),
  stores: process.env.STORES?.split(',').map((s) => s.trim()) ?? null,
  proxy: {
    host: process.env.WEBSHARE_HOST ?? 'p.webshare.io',
    port: process.env.WEBSHARE_PORT ?? '80',
    username: process.env.WEBSHARE_USERNAME ?? '',
    password: process.env.WEBSHARE_PASSWORD ?? '',
  },
};

interface TestResult {
  store: string;
  card: string;
  success: boolean;
  resultsCount: number;
  durationMs: number;
  error?: string;
  httpStatus?: number;
  errorType?: ScrapeErrorType;
  retryable?: boolean;
}

function log(message: string, indent = 0) {
  const prefix = '  '.repeat(indent);
  console.log(`${prefix}${message}`);
}

function logSeparator(char = '=', length = 70) {
  console.log(char.repeat(length));
}

function createProxyAgent(): undici.ProxyAgent {
  const { host, port, username, password } = CONFIG.proxy;

  if (!username || !password) {
    console.error('ERROR: Proxy credentials not configured in .env file');
    console.error('Required: WEBSHARE_USERNAME, WEBSHARE_PASSWORD');
    process.exit(1);
  }

  const proxyUri = `http://${username}:${password}@${host}:${port}`;
  log(`Using proxy: ${host}:${port}`);

  return new undici.ProxyAgent({
    uri: proxyUri,
    connections: 50,
    keepAliveTimeout: 60000,
  });
}

async function testStore(
  store: (typeof ALL_BINDERPOS_STORES)[0],
  cardName: string,
  proxyAgent: undici.ProxyAgent,
): Promise<TestResult> {
  const startTime = Date.now();
  const loader = new BinderPOSLoader(store.baseUrl, store.searchPath, proxyAgent);
  const parser = new BinderPOSParser(store.baseUrl);

  try {
    const searchResult = await loader.search(cardName);
    const durationMs = Date.now() - startTime;

    // Check if the loader returned an error (now with error type classification)
    if (searchResult.error) {
      // Log detailed error info for debugging
      if (searchResult.errorType) {
        console.log(
          `\n[ERROR] ${store.name} / ${cardName}: ${searchResult.errorType} (HTTP ${searchResult.status ?? 'N/A'})`,
        );
        console.log(`  Message: ${searchResult.error}`);
        console.log(`  Retryable: ${searchResult.retryable ? 'Yes' : 'No'}\n`);
      }

      return {
        store: store.name,
        card: cardName,
        success: false,
        resultsCount: 0,
        durationMs,
        httpStatus: searchResult.status,
        error: searchResult.error,
        errorType: searchResult.errorType,
        retryable: searchResult.retryable,
      };
    }

    // Parse the results
    const parseResult = await parser.extractItems(searchResult.result);

    if (parseResult.error) {
      return {
        store: store.name,
        card: cardName,
        success: false,
        resultsCount: 0,
        durationMs,
        httpStatus: searchResult.status,
        error: parseResult.error,
        errorType: ScrapeErrorType.PARSE_ERROR,
        retryable: false,
      };
    }

    return {
      store: store.name,
      card: cardName,
      success: true,
      resultsCount: parseResult.result.length,
      durationMs,
      httpStatus: searchResult.status,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);

    return {
      store: store.name,
      card: cardName,
      success: false,
      resultsCount: 0,
      durationMs,
      error: errorMsg,
      errorType: ScrapeErrorType.UNKNOWN,
      retryable: false,
    };
  }
}

async function runBatch(
  tasks: Array<{ store: (typeof ALL_BINDERPOS_STORES)[0]; card: string }>,
  proxyAgent: undici.ProxyAgent,
): Promise<TestResult[]> {
  const results = await Promise.all(
    tasks.map(({ store, card }) => testStore(store, card, proxyAgent)),
  );
  return results;
}

async function main() {
  // Filter stores if specified
  const stores = CONFIG.stores
    ? ALL_BINDERPOS_STORES.filter((s) => CONFIG.stores!.includes(s.name))
    : ALL_BINDERPOS_STORES;

  if (stores.length === 0) {
    console.error('No matching stores found');
    process.exit(1);
  }

  logSeparator();
  log('BinderPOS Rate Limiting Test');
  logSeparator();
  log(`Stores: ${stores.map((s) => s.name).join(', ')}`);
  log(`Cards: ${CONFIG.cards.join(', ')}`);
  log(`Concurrency: ${CONFIG.concurrency}`);
  log(`Delay between batches: ${CONFIG.delayMs}ms`);
  log(`Repeat: ${CONFIG.repeat}x`);
  logSeparator();

  const proxyAgent = createProxyAgent();

  // Build all tasks
  const allTasks: Array<{ store: (typeof ALL_BINDERPOS_STORES)[0]; card: string }> = [];
  for (const store of stores) {
    for (const card of CONFIG.cards) {
      allTasks.push({ store, card });
    }
  }

  const allResults: TestResult[] = [];
  const startTime = Date.now();

  for (let round = 1; round <= CONFIG.repeat; round++) {
    if (CONFIG.repeat > 1) {
      log('');
      logSeparator('-');
      log(`Round ${round}/${CONFIG.repeat}`);
      logSeparator('-');
    }

    // Split tasks into batches based on concurrency
    for (let i = 0; i < allTasks.length; i += CONFIG.concurrency) {
      const batch = allTasks.slice(i, i + CONFIG.concurrency);

      log(`\nBatch ${Math.floor(i / CONFIG.concurrency) + 1}: ${batch.length} requests...`);

      const batchResults = await runBatch(batch, proxyAgent);

      for (const result of batchResults) {
        allResults.push(result);

        const status = result.success
          ? 'OK'
          : result.errorType
            ? result.errorType
            : 'FAIL';
        const details = result.success
          ? `${result.resultsCount} results`
          : `${result.error?.substring(0, 50)}${result.httpStatus ? ` [HTTP ${result.httpStatus}]` : ''}`;
        log(`  [${status}] ${result.store} / ${result.card} (${result.durationMs}ms) - ${details}`);
      }

      // Delay between batches if configured
      if (CONFIG.delayMs > 0 && i + CONFIG.concurrency < allTasks.length) {
        log(`  Waiting ${CONFIG.delayMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, CONFIG.delayMs));
      }
    }
  }

  const totalDuration = Date.now() - startTime;

  // Close proxy agent
  await proxyAgent.close();

  // Summary
  log('');
  logSeparator();
  log('SUMMARY');
  logSeparator();

  const totalTests = allResults.length;
  const successCount = allResults.filter((r) => r.success).length;
  const failedResults = allResults.filter((r) => !r.success);
  const retryableCount = failedResults.filter((r) => r.retryable).length;
  const nonRetryableCount = failedResults.filter((r) => !r.retryable).length;
  const totalCards = allResults.reduce((sum, r) => sum + r.resultsCount, 0);
  const avgDuration = Math.round(allResults.reduce((sum, r) => sum + r.durationMs, 0) / totalTests);

  // Group errors by type
  const errorsByType = new Map<string, number>();
  for (const result of failedResults) {
    const type = result.errorType ?? 'UNKNOWN';
    errorsByType.set(type, (errorsByType.get(type) ?? 0) + 1);
  }

  log(`Total tests: ${totalTests}`);
  log(`Successful: ${successCount} (${((successCount / totalTests) * 100).toFixed(1)}%)`);
  log(`Failed: ${failedResults.length}`);
  log(`  - Retryable: ${retryableCount}`);
  log(`  - Non-retryable: ${nonRetryableCount}`);
  if (errorsByType.size > 0) {
    log(`Error breakdown:`);
    for (const [type, count] of errorsByType.entries()) {
      log(`  - ${type}: ${count}`);
    }
  }
  log(`Total cards found: ${totalCards}`);
  log(`Average response time: ${avgDuration}ms`);
  log(`Total test duration: ${(totalDuration / 1000).toFixed(1)}s`);

  // Per-store breakdown
  log('');
  logSeparator('-');
  log('Per-store breakdown:');
  logSeparator('-');

  for (const store of stores) {
    const storeResults = allResults.filter((r) => r.store === store.name);
    const storeSuccess = storeResults.filter((r) => r.success).length;
    const storeFailed = storeResults.filter((r) => !r.success).length;
    const storeAvgDuration = Math.round(
      storeResults.reduce((sum, r) => sum + r.durationMs, 0) / storeResults.length,
    );

    log(
      `${store.displayName}: ${storeSuccess}/${storeResults.length} OK, ${storeFailed} failed, avg ${storeAvgDuration}ms`,
    );
  }

  // Show all failed requests grouped by error type
  if (failedResults.length > 0) {
    log('');
    logSeparator('-');
    log('Failed requests by error type:');
    logSeparator('-');

    // Group by error type
    const byType = new Map<string, TestResult[]>();
    for (const result of failedResults) {
      const type = result.errorType ?? 'UNKNOWN';
      if (!byType.has(type)) {
        byType.set(type, []);
      }
      byType.get(type)!.push(result);
    }

    for (const [type, results] of byType.entries()) {
      log(`\n  ${type} (${results.length}):`);
      for (const result of results.slice(0, 5)) {
        // Show max 5 per type
        log(`    - ${result.store} / ${result.card}: ${result.error}`);
      }
      if (results.length > 5) {
        log(`    ... and ${results.length - 5} more`);
      }
    }
  }

  logSeparator();

  // Exit with error if there were non-retryable failures
  if (nonRetryableCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
