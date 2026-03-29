/**
 * TLS Session Reuse Test Script
 *
 * Measures the actual data overhead of TLS handshakes when making HEAD requests
 * through rotating proxy IPs vs pinned proxy IPs with TLS session reuse.
 *
 * Tracks bytes at the raw TCP socket level (net.Socket.bytesRead/bytesWritten)
 * which captures everything flowing through the proxy: CONNECT setup, TLS
 * handshake, and HTTP request/response.
 *
 * Usage:
 *   npx tsx scripts/test-tls-reuse.ts
 *
 * Environment variables (reads from apps/scraper/.env by default):
 *   WEBSHARE_USERNAME, WEBSHARE_PASSWORD, WEBSHARE_HOST, WEBSHARE_PORT
 *   TARGET_HOST     - Shopify store hostname (default: facetofacegames.com)
 *   TARGET_PATH     - URL path for HEAD requests (default: /collections/mtg-singles)
 *   NUM_REQUESTS    - Requests per scenario (default: 10)
 */

import * as net from 'node:net';
import * as tls from 'node:tls';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Load .env from apps/scraper/.env
// ---------------------------------------------------------------------------
function loadEnv(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

const envPath = path.resolve(import.meta.dirname ?? __dirname, '..', 'apps', 'scraper', '.env');
loadEnv(envPath);

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const PROXY_HOST = process.env.WEBSHARE_HOST || 'p.webshare.io';
const PROXY_PORT = parseInt(process.env.WEBSHARE_PORT || '80', 10);
const PROXY_USERNAME = process.env.WEBSHARE_USERNAME!;
const PROXY_PASSWORD = process.env.WEBSHARE_PASSWORD!;
const TARGET_HOST = process.env.TARGET_HOST || 'facetofacegames.com';
const TARGET_PATH = process.env.TARGET_PATH || '/collections/mtg-singles';
const NUM_REQUESTS = parseInt(process.env.NUM_REQUESTS || '10', 10);

if (!PROXY_USERNAME || !PROXY_PASSWORD) {
  console.error('WEBSHARE_USERNAME and WEBSHARE_PASSWORD are required.');
  console.error('Set them as env vars or ensure apps/scraper/.env exists.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface RequestResult {
  proxyNumber: number;
  statusCode: number;
  sessionReused: boolean;
  tlsProtocol: string | null;
  cipher: string | undefined;
  bytes: {
    connect: { sent: number; received: number; total: number };
    tlsHandshake: { sent: number; received: number; total: number };
    http: { sent: number; received: number; total: number };
    total: { sent: number; received: number; total: number };
  };
  tlsSession: Buffer | undefined;
}

interface ScenarioSummary {
  name: string;
  requests: number;
  avgTotalBytes: number;
  avgTlsHandshakeBytes: number;
  avgHttpBytes: number;
  avgConnectBytes: number;
  totalDataTransferred: number;
  sessionReuseRate: string;
  results: RequestResult[];
}

// ---------------------------------------------------------------------------
// Core: make a single HEAD request through a CONNECT proxy
// ---------------------------------------------------------------------------
function headRequestThroughProxy(
  proxyNumber: number,
  targetHost: string,
  targetPath: string,
  tlsSession?: Buffer,
): Promise<RequestResult> {
  return new Promise((resolve, reject) => {
    const proxyUser = `${PROXY_USERNAME}-${proxyNumber}`;
    const auth = Buffer.from(`${proxyUser}:${PROXY_PASSWORD}`).toString('base64');

    const socket = net.connect({ host: PROXY_HOST, port: PROXY_PORT });

    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Timeout (15s) - proxy ${proxyNumber}`));
    }, 15_000);

    socket.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    socket.once('connect', () => {
      // Step 1: send CONNECT request to proxy
      socket.write(
        `CONNECT ${targetHost}:443 HTTP/1.1\r\n` +
        `Host: ${targetHost}:443\r\n` +
        `Proxy-Authorization: Basic ${auth}\r\n` +
        `\r\n`,
      );
    });

    let connectBuf = '';

    const onConnectData = (chunk: Buffer) => {
      connectBuf += chunk.toString();

      if (!connectBuf.includes('\r\n\r\n')) return; // wait for full response

      const statusLine = connectBuf.split('\r\n')[0];
      const statusMatch = statusLine.match(/HTTP\/\d\.\d (\d+)/);

      if (!statusMatch || statusMatch[1] !== '200') {
        clearTimeout(timer);
        socket.destroy();
        reject(new Error(`CONNECT failed: ${statusLine}`));
        return;
      }

      socket.removeListener('data', onConnectData);

      // Snapshot bytes after CONNECT setup
      const connectBytes = {
        sent: socket.bytesWritten,
        received: socket.bytesRead,
      };

      // Step 2: upgrade to TLS inside the tunnel
      const tlsOpts: tls.ConnectionOptions = {
        socket,
        servername: targetHost,
      };
      if (tlsSession) {
        tlsOpts.session = tlsSession;
      }

      const tlsSocket = tls.connect(tlsOpts);

      tlsSocket.once('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });

      tlsSocket.once('secureConnect', () => {
        // Snapshot bytes after TLS handshake
        const afterTls = {
          sent: socket.bytesWritten,
          received: socket.bytesRead,
        };

        const sessionReused = tlsSocket.isSessionReused();
        const newSession = tlsSocket.getSession();
        const protocol = tlsSocket.getProtocol();
        const cipher = tlsSocket.getCipher();

        // Step 3: send HEAD request
        tlsSocket.write(
          `HEAD ${targetPath} HTTP/1.1\r\n` +
          `Host: ${targetHost}\r\n` +
          `User-Agent: Mozilla/5.0 (compatible; ScoutLGS/1.0; +https://scoutlgs.com)\r\n` +
          `Connection: close\r\n` +
          `\r\n`,
        );

        let httpResponse = '';
        tlsSocket.on('data', (data) => {
          httpResponse += data.toString();
        });

        let resolved = false;
        const finish = () => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timer);

          const finalBytes = {
            sent: socket.bytesWritten,
            received: socket.bytesRead,
          };

          const statusCode = parseInt(
            (httpResponse.split('\r\n')[0] || '').split(' ')[1] || '0',
            10,
          );

          resolve({
            proxyNumber,
            statusCode,
            sessionReused,
            tlsProtocol: protocol,
            cipher: cipher?.name,
            bytes: {
              connect: {
                sent: connectBytes.sent,
                received: connectBytes.received,
                total: connectBytes.sent + connectBytes.received,
              },
              tlsHandshake: {
                sent: afterTls.sent - connectBytes.sent,
                received: afterTls.received - connectBytes.received,
                total:
                  afterTls.sent - connectBytes.sent +
                  (afterTls.received - connectBytes.received),
              },
              http: {
                sent: finalBytes.sent - afterTls.sent,
                received: finalBytes.received - afterTls.received,
                total:
                  finalBytes.sent - afterTls.sent +
                  (finalBytes.received - afterTls.received),
              },
              total: {
                sent: finalBytes.sent,
                received: finalBytes.received,
                total: finalBytes.sent + finalBytes.received,
              },
            },
            tlsSession: newSession,
          });
        };

        tlsSocket.once('end', finish);
        tlsSocket.once('close', finish);
      });
    };

    socket.on('data', onConnectData);
  });
}

// ---------------------------------------------------------------------------
// Delay helper
// ---------------------------------------------------------------------------
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Scenario runners
// ---------------------------------------------------------------------------

/**
 * Scenario A: Rotating proxy IPs (current behavior)
 * Each request uses a different proxy IP -> no TLS session reuse possible
 */
async function scenarioRotating(n: number): Promise<ScenarioSummary> {
  const results: RequestResult[] = [];
  // Use proxy numbers 1..N (each different)
  for (let i = 0; i < n; i++) {
    const proxyNum = i + 1;
    try {
      const result = await headRequestThroughProxy(proxyNum, TARGET_HOST, TARGET_PATH);
      results.push(result);
      process.stdout.write(`  [${i + 1}/${n}] proxy=${proxyNum} status=${result.statusCode} total=${result.bytes.total.total}B tls=${result.bytes.tlsHandshake.total}B reused=${result.sessionReused}\n`);
    } catch (err) {
      console.error(`  [${i + 1}/${n}] proxy=${proxyNum} FAILED: ${err}`);
    }
    await delay(200); // small gap to avoid rate limits
  }
  return summarize('A: Rotating IPs (no reuse)', results);
}

/**
 * Scenario B: Pinned single proxy IP with TLS session reuse
 * All requests use the same proxy IP, passing the session ticket forward
 */
async function scenarioPinned(n: number): Promise<ScenarioSummary> {
  const results: RequestResult[] = [];
  const pinnedProxy = 1;
  let session: Buffer | undefined;

  for (let i = 0; i < n; i++) {
    try {
      const result = await headRequestThroughProxy(
        pinnedProxy,
        TARGET_HOST,
        TARGET_PATH,
        session,
      );
      results.push(result);
      // Capture session ticket for next request
      if (result.tlsSession) {
        session = result.tlsSession;
      }
      process.stdout.write(`  [${i + 1}/${n}] proxy=${pinnedProxy} status=${result.statusCode} total=${result.bytes.total.total}B tls=${result.bytes.tlsHandshake.total}B reused=${result.sessionReused}\n`);
    } catch (err) {
      console.error(`  [${i + 1}/${n}] proxy=${pinnedProxy} FAILED: ${err}`);
    }
    await delay(200);
  }
  return summarize('B: Pinned IP + TLS session reuse', results);
}

/**
 * Scenario C: Cross-proxy TLS session reuse
 * Different proxy IPs but attempting to reuse the TLS session ticket
 * from the first connection. Tests whether the origin server accepts
 * session resumption from a different source IP.
 */
async function scenarioCrossProxy(n: number): Promise<ScenarioSummary> {
  const results: RequestResult[] = [];
  let session: Buffer | undefined;

  // First request: establish session
  const firstProxy = 50;
  try {
    const first = await headRequestThroughProxy(firstProxy, TARGET_HOST, TARGET_PATH);
    results.push(first);
    session = first.tlsSession;
    process.stdout.write(`  [1/${n}] proxy=${firstProxy} status=${first.statusCode} total=${first.bytes.total.total}B tls=${first.bytes.tlsHandshake.total}B reused=${first.sessionReused} (seed)\n`);
  } catch (err) {
    console.error(`  [1/${n}] proxy=${firstProxy} FAILED: ${err}`);
  }

  // Remaining requests: different proxy IPs, same session ticket
  for (let i = 1; i < n; i++) {
    const proxyNum = 50 + i;
    await delay(200);
    try {
      const result = await headRequestThroughProxy(
        proxyNum,
        TARGET_HOST,
        TARGET_PATH,
        session,
      );
      results.push(result);
      process.stdout.write(`  [${i + 1}/${n}] proxy=${proxyNum} status=${result.statusCode} total=${result.bytes.total.total}B tls=${result.bytes.tlsHandshake.total}B reused=${result.sessionReused}\n`);
    } catch (err) {
      console.error(`  [${i + 1}/${n}] proxy=${proxyNum} FAILED: ${err}`);
    }
  }
  return summarize('C: Cross-proxy session reuse attempt', results);
}

/**
 * Scenario D: Keep-alive connection reuse (pinned proxy IP)
 * Opens ONE TCP+TLS connection through a single proxy IP and sends
 * multiple HEAD requests over it using Connection: keep-alive.
 * The TLS handshake cost is paid once; subsequent requests only pay
 * for the HTTP bytes (encrypted, but no new handshake).
 */
async function scenarioKeepAlive(n: number): Promise<ScenarioSummary> {
  const results: RequestResult[] = [];
  const pinnedProxy = 1;
  const proxyUser = `${PROXY_USERNAME}-${pinnedProxy}`;
  const auth = Buffer.from(`${proxyUser}:${PROXY_PASSWORD}`).toString('base64');

  // Establish a single CONNECT tunnel + TLS connection
  const { socket, tlsSocket, connectBytes } = await new Promise<{
    socket: net.Socket;
    tlsSocket: tls.TLSSocket;
    connectBytes: { sent: number; received: number };
  }>((resolve, reject) => {
    const sock = net.connect({ host: PROXY_HOST, port: PROXY_PORT });
    const timer = setTimeout(() => { sock.destroy(); reject(new Error('Timeout')); }, 15_000);

    sock.once('error', (err) => { clearTimeout(timer); reject(err); });
    sock.once('connect', () => {
      sock.write(
        `CONNECT ${TARGET_HOST}:443 HTTP/1.1\r\n` +
        `Host: ${TARGET_HOST}:443\r\n` +
        `Proxy-Authorization: Basic ${auth}\r\n` +
        `\r\n`,
      );
    });

    let buf = '';
    const onData = (chunk: Buffer) => {
      buf += chunk.toString();
      if (!buf.includes('\r\n\r\n')) return;
      const status = buf.split('\r\n')[0];
      if (!status.includes(' 200')) {
        clearTimeout(timer); sock.destroy(); reject(new Error(`CONNECT: ${status}`)); return;
      }
      sock.removeListener('data', onData);

      const cb = { sent: sock.bytesWritten, received: sock.bytesRead };
      const ts = tls.connect({ socket: sock, servername: TARGET_HOST });
      ts.once('error', (err) => { clearTimeout(timer); reject(err); });
      ts.once('secureConnect', () => {
        clearTimeout(timer);
        resolve({ socket: sock, tlsSocket: ts, connectBytes: cb });
      });
    };
    sock.on('data', onData);
  });

  const afterTlsSetup = { sent: socket.bytesWritten, received: socket.bytesRead };
  const tlsHandshakeOnce = {
    sent: afterTlsSetup.sent - connectBytes.sent,
    received: afterTlsSetup.received - connectBytes.received,
    total: (afterTlsSetup.sent - connectBytes.sent) + (afterTlsSetup.received - connectBytes.received),
  };

  console.log(`  Connection established. TLS handshake: ${tlsHandshakeOnce.total}B (one-time cost)`);

  // Send N HEAD requests over the same connection using keep-alive
  for (let i = 0; i < n; i++) {
    const beforeReq = { sent: socket.bytesWritten, received: socket.bytesRead };

    // Use Connection: keep-alive for all but the last request
    const connHeader = i < n - 1 ? 'keep-alive' : 'close';

    try {
      const { statusCode, httpResponse } = await new Promise<{ statusCode: number; httpResponse: string }>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timeout')), 15_000);

        tlsSocket.write(
          `HEAD ${TARGET_PATH} HTTP/1.1\r\n` +
          `Host: ${TARGET_HOST}\r\n` +
          `User-Agent: Mozilla/5.0 (compatible; ScoutLGS/1.0; +https://scoutlgs.com)\r\n` +
          `Connection: ${connHeader}\r\n` +
          `\r\n`,
        );

        let resp = '';
        const onData = (chunk: Buffer) => {
          resp += chunk.toString();
          // HEAD responses have no body; complete when we see end of headers
          if (resp.includes('\r\n\r\n')) {
            clearTimeout(timer);
            tlsSocket.removeListener('data', onData);
            const sc = parseInt((resp.split('\r\n')[0] || '').split(' ')[1] || '0', 10);
            resolve({ statusCode: sc, httpResponse: resp });
          }
        };

        // If this is the last request (Connection: close), also handle 'end'
        if (connHeader === 'close') {
          tlsSocket.once('end', () => {
            clearTimeout(timer);
            tlsSocket.removeListener('data', onData);
            const sc = parseInt((resp.split('\r\n')[0] || '').split(' ')[1] || '0', 10);
            resolve({ statusCode: sc, httpResponse: resp });
          });
        }

        tlsSocket.on('data', onData);
        tlsSocket.once('error', (err) => { clearTimeout(timer); reject(err); });
      });

      // Brief pause to let socket counters settle
      await delay(10);

      const afterReq = { sent: socket.bytesWritten, received: socket.bytesRead };
      const reqBytes = {
        sent: afterReq.sent - beforeReq.sent,
        received: afterReq.received - beforeReq.received,
        total: (afterReq.sent - beforeReq.sent) + (afterReq.received - beforeReq.received),
      };

      // For the first request, the TLS handshake cost is included in the totals
      // For subsequent requests, there is no TLS cost at all
      const isFirst = i === 0;
      results.push({
        proxyNumber: pinnedProxy,
        statusCode,
        sessionReused: !isFirst, // not TLS session reuse, but connection reuse
        tlsProtocol: tlsSocket.getProtocol(),
        cipher: tlsSocket.getCipher()?.name,
        bytes: {
          connect: isFirst
            ? { sent: connectBytes.sent, received: connectBytes.received, total: connectBytes.sent + connectBytes.received }
            : { sent: 0, received: 0, total: 0 },
          tlsHandshake: isFirst
            ? tlsHandshakeOnce
            : { sent: 0, received: 0, total: 0 },
          http: reqBytes,
          total: isFirst
            ? {
                sent: connectBytes.sent + tlsHandshakeOnce.sent + reqBytes.sent,
                received: connectBytes.received + tlsHandshakeOnce.received + reqBytes.received,
                total: connectBytes.sent + connectBytes.received + tlsHandshakeOnce.total + reqBytes.total,
              }
            : reqBytes,
        },
        tlsSession: undefined,
      });

      process.stdout.write(`  [${i + 1}/${n}] proxy=${pinnedProxy} status=${statusCode} http=${reqBytes.total}B total=${isFirst ? connectBytes.sent + connectBytes.received + tlsHandshakeOnce.total + reqBytes.total : reqBytes.total}B conn_reuse=${!isFirst}\n`);
    } catch (err) {
      console.error(`  [${i + 1}/${n}] proxy=${pinnedProxy} FAILED: ${err}`);
      break; // Connection is likely dead
    }
  }

  // Clean up
  tlsSocket.destroy();
  socket.destroy();

  return summarize('D: Keep-alive connection reuse (pinned IP)', results);
}

// ---------------------------------------------------------------------------
// Summarize results
// ---------------------------------------------------------------------------
function summarize(name: string, results: RequestResult[]): ScenarioSummary {
  if (results.length === 0) {
    return {
      name,
      requests: 0,
      avgTotalBytes: 0,
      avgTlsHandshakeBytes: 0,
      avgHttpBytes: 0,
      avgConnectBytes: 0,
      totalDataTransferred: 0,
      sessionReuseRate: '0%',
      results,
    };
  }

  const totals = results.reduce(
    (acc, r) => ({
      total: acc.total + r.bytes.total.total,
      tls: acc.tls + r.bytes.tlsHandshake.total,
      http: acc.http + r.bytes.http.total,
      connect: acc.connect + r.bytes.connect.total,
      reused: acc.reused + (r.sessionReused ? 1 : 0),
    }),
    { total: 0, tls: 0, http: 0, connect: 0, reused: 0 },
  );

  const n = results.length;
  return {
    name,
    requests: n,
    avgTotalBytes: Math.round(totals.total / n),
    avgTlsHandshakeBytes: Math.round(totals.tls / n),
    avgHttpBytes: Math.round(totals.http / n),
    avgConnectBytes: Math.round(totals.connect / n),
    totalDataTransferred: totals.total,
    sessionReuseRate: `${totals.reused}/${n} (${Math.round((totals.reused / n) * 100)}%)`,
    results,
  };
}

// ---------------------------------------------------------------------------
// Pretty print
// ---------------------------------------------------------------------------
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function printSummary(s: ScenarioSummary): void {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${s.name}`);
  console.log('='.repeat(70));
  console.log(`  Requests completed:    ${s.requests}`);
  console.log(`  Session reuse rate:    ${s.sessionReuseRate}`);
  console.log(`  Total data transferred:${formatBytes(s.totalDataTransferred).padStart(12)}`);
  console.log('  --- Per-request averages ---');
  console.log(`  CONNECT setup:         ${formatBytes(s.avgConnectBytes).padStart(12)}`);
  console.log(`  TLS handshake:         ${formatBytes(s.avgTlsHandshakeBytes).padStart(12)}`);
  console.log(`  HTTP (HEAD req+res):   ${formatBytes(s.avgHttpBytes).padStart(12)}`);
  console.log(`  Total per request:     ${formatBytes(s.avgTotalBytes).padStart(12)}`);
}

function printComparison(scenarios: ScenarioSummary[]): void {
  console.log(`\n${'='.repeat(70)}`);
  console.log('  COMPARISON');
  console.log('='.repeat(70));

  const baseline = scenarios[0];
  if (!baseline || baseline.avgTotalBytes === 0) return;

  const header = ['Metric', ...scenarios.map((s) => s.name.split(':')[0].trim())];
  const rows = [
    ['Avg total/req', ...scenarios.map((s) => formatBytes(s.avgTotalBytes))],
    ['Avg TLS/req', ...scenarios.map((s) => formatBytes(s.avgTlsHandshakeBytes))],
    ['Avg HTTP/req', ...scenarios.map((s) => formatBytes(s.avgHttpBytes))],
    ['Session reuse', ...scenarios.map((s) => s.sessionReuseRate)],
    [
      'Savings vs A',
      ...scenarios.map((s) => {
        if (s === baseline) return '-';
        const pct = ((1 - s.avgTotalBytes / baseline.avgTotalBytes) * 100).toFixed(1);
        return `${pct}% (${formatBytes(baseline.avgTotalBytes - s.avgTotalBytes)}/req)`;
      }),
    ],
  ];

  // Calculate column widths
  const colWidths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] || '').length)) + 2,
  );

  const sep = colWidths.map((w) => '-'.repeat(w)).join('+');
  const fmtRow = (row: string[]) =>
    row.map((cell, i) => cell.padEnd(colWidths[i])).join('|');

  console.log(`  ${fmtRow(header)}`);
  console.log(`  ${sep}`);
  for (const row of rows) {
    console.log(`  ${fmtRow(row)}`);
  }

  // Extrapolation for 30K requests
  const reqCount = 30_000;
  console.log(`\n  --- Extrapolated to ${reqCount.toLocaleString()} HEAD requests ---`);
  for (const s of scenarios) {
    const total = s.avgTotalBytes * reqCount;
    const tlsOnly = s.avgTlsHandshakeBytes * reqCount;
    console.log(`  ${s.name.split(':')[0].trim()}: ${formatBytes(total)} total (${formatBytes(tlsOnly)} TLS overhead)`);
  }
}

// ---------------------------------------------------------------------------
// Per-request detail table
// ---------------------------------------------------------------------------
function printDetailTable(s: ScenarioSummary): void {
  console.log(`\n  Detail: ${s.name}`);
  console.log(`  ${'#'.padEnd(4)} ${'Proxy'.padEnd(7)} ${'Status'.padEnd(8)} ${'Connect'.padStart(9)} ${'TLS'.padStart(9)} ${'HTTP'.padStart(9)} ${'Total'.padStart(9)} ${'Reused'.padEnd(7)}`);
  console.log(`  ${'-'.repeat(68)}`);
  for (let i = 0; i < s.results.length; i++) {
    const r = s.results[i];
    console.log(
      `  ${String(i + 1).padEnd(4)} ` +
      `${String(r.proxyNumber).padEnd(7)} ` +
      `${String(r.statusCode).padEnd(8)} ` +
      `${formatBytes(r.bytes.connect.total).padStart(9)} ` +
      `${formatBytes(r.bytes.tlsHandshake.total).padStart(9)} ` +
      `${formatBytes(r.bytes.http.total).padStart(9)} ` +
      `${formatBytes(r.bytes.total.total).padStart(9)} ` +
      `${r.sessionReused ? 'YES' : 'no'}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  console.log('TLS Session Reuse Test');
  console.log('='.repeat(70));
  console.log(`Proxy:          ${PROXY_HOST}:${PROXY_PORT}`);
  console.log(`Target:         ${TARGET_HOST}${TARGET_PATH}`);
  console.log(`Requests/scene: ${NUM_REQUESTS}`);
  console.log(`Method:         HEAD`);
  console.log('');
  console.log('Measuring raw TCP socket bytes (bytesRead + bytesWritten)');
  console.log('This captures everything flowing through the proxy:');
  console.log('  CONNECT tunnel setup + TLS handshake + HTTP request/response');
  console.log('');

  // --- Scenario A: Rotating ---
  console.log('--- Scenario A: Rotating proxy IPs (current behavior) ---');
  const scenA = await scenarioRotating(NUM_REQUESTS);

  await delay(1000);

  // --- Scenario B: Pinned ---
  console.log('\n--- Scenario B: Pinned proxy IP + TLS session reuse ---');
  const scenB = await scenarioPinned(NUM_REQUESTS);

  await delay(1000);

  // --- Scenario C: Cross-proxy ---
  console.log('\n--- Scenario C: Cross-proxy session reuse attempt ---');
  const scenC = await scenarioCrossProxy(NUM_REQUESTS);

  await delay(1000);

  // --- Scenario D: Keep-alive ---
  console.log('\n--- Scenario D: Keep-alive connection reuse (pinned IP) ---');
  const scenD = await scenarioKeepAlive(NUM_REQUESTS);

  // --- Results ---
  for (const s of [scenA, scenB, scenC, scenD]) {
    printSummary(s);
    printDetailTable(s);
  }

  printComparison([scenA, scenB, scenC, scenD]);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
