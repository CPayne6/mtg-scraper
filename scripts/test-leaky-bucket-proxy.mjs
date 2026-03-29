/**
 * Leaky Bucket — find sustainable rate per store
 *
 * Sends pipelined requests at the given RATE. If no 429 after MAX_REQUESTS, the rate is sustainable.
 *
 * Usage: node scripts/test-leaky-bucket-proxy.mjs [--rate=25] [store-name ...]
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { ProxyAgent, fetch } = require('../apps/scraper/node_modules/undici');

const PROXY_USER = 'xhpbpdvf';
const PROXY_PASS = 'w1smgf10n9ys';
const PROXY_HOST = 'p.webshare.io';
const PROXY_PORT = '80';
const IP_POOL_SIZE = 1000;
const MAX_REQUESTS = 2000;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const STORES = [
  { name: 'exor-games', baseUrl: 'https://exorgames.com', handle: 'fallen-askari-visions' },
  { name: 'house-of-cards', baseUrl: 'https://houseofcards.ca', handle: 'blood-operative-guilds-of-ravnica' },
  { name: 'game-knight', baseUrl: 'https://gameknight.ca', handle: '101056n' },
  { name: 'the-cg-realm', baseUrl: 'https://www.thecgrealm.com', handle: 'kor-outfitter-zendikar' },
  { name: '401-games', baseUrl: 'https://store.401games.ca', handle: 'dungeons-and-dragons-minis-icons-of-the-realms-tyranny-of-dragons-booster-pack' },
  { name: 'black-knight-games', baseUrl: 'https://blackknightgames.ca', handle: 'mtg-invisible-stalkerinnistrad' },
  { name: 'face-to-face-games', baseUrl: 'https://www.facetofacegames.com', handle: 'flexxfolio-lands-edition-ii-forest' },
  { name: 'hobbiesville', baseUrl: 'https://www.hobbiesville.ca', handle: 'pokemon-sun-and-moon-elite-trainer-box' },
];

// Parse args
const args = process.argv.slice(2);
const rateArg = args.find(a => a.startsWith('--rate='));
const RATE = rateArg ? parseInt(rateArg.split('=')[1]) : 25;
const INTERVAL = 1000 / RATE;
const storeNames = args.filter(a => !a.startsWith('--'));

function createProxyAgent(n) {
  return new ProxyAgent({ uri: `http://${PROXY_USER}-${n}:${PROXY_PASS}@${PROXY_HOST}:${PROXY_PORT}`, connections: 100 });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function testStore(store) {
  const url = `${store.baseUrl}/products/${store.handle}.js`;
  const proxyNum = Math.floor(Math.random() * IP_POOL_SIZE) + 1;
  const agent = createProxyAgent(proxyNum);

  let ok = 0;
  let limited = 0;
  let errors = 0;
  let hit429 = false;
  const start = Date.now();
  const promises = [];

  console.log(`\n${store.name} (proxy #${proxyNum}) @ ${RATE} req/s`);

  for (let i = 0; i < MAX_REQUESTS; i++) {
    if (hit429) break;

    const p = fetch(url, {
      dispatcher: agent,
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    }).then(res => {
      if (res.status === 429) { hit429 = true; limited++; }
      else if (res.status === 200) ok++;
      else errors++;
    }).catch(() => { errors++; });

    promises.push(p);

    if ((i + 1) % 100 === 0) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`  sent=${i + 1} ok=${ok} 429=${limited} err=${errors} (${elapsed}s)`);
    }

    const nextLaunch = (i + 1) * INTERVAL;
    const now = Date.now() - start;
    if (nextLaunch > now) await sleep(nextLaunch - now);
  }

  await Promise.all(promises);
  await agent.close().catch(() => {});

  const elapsed = +((Date.now() - start) / 1000).toFixed(1);
  const hitLimit = limited > 0;
  const status = hitLimit ? `HIT 429 at ${ok} reqs` : `OK — ${ok} reqs, no 429`;
  console.log(`  >> ${status} (${elapsed}s)`);

  return { store: store.name, rate: RATE, ok, limited, elapsed, hitLimit };
}

async function main() {
  console.log(`Rate Limit Test @ ${RATE} req/s (pipelined via proxy)\n`);

  const stores = storeNames.length ? STORES.filter(s => storeNames.includes(s.name)) : STORES;

  if (!stores.length) {
    console.log(`No match. Available: ${STORES.map(s => s.name).join(', ')}`);
    process.exit(1);
  }

  const results = [];
  for (const s of stores) {
    results.push(await testStore(s));
  }

  console.log('\n' + '═'.repeat(55));
  console.log('SUMMARY');
  console.log('═'.repeat(55));
  console.log('Store                | Rate | Reqs   | Result');
  console.log('---------------------|------|--------|--------');
  for (const r of results) {
    const result = r.hitLimit ? `429 @ ${r.ok}` : 'OK';
    console.log(`${r.store.padEnd(20)} | ${String(r.rate).padEnd(4)} | ${String(r.ok).padEnd(6)} | ${result}`);
  }

  const limited = results.filter(r => r.hitLimit).map(r => r.store);
  if (limited.length) {
    console.log(`\nHit limit: ${limited.join(', ')}`);
    console.log(`Rerun with: node scripts/test-leaky-bucket-proxy.mjs --rate=${RATE - 5} ${limited.join(' ')}`);
  } else {
    console.log(`\nAll stores sustained ${RATE} req/s!`);
  }
}

main().catch(console.error);
