#!/usr/bin/env node
/**
 * Refresh only the local offer freshness and stock state from production.
 *
 * This is deliberately a small daily-development sync. It does not copy the
 * card catalog, prices, products, users, carts, or lists. The first run
 * streams compact stock-state rows; later runs stream only variants modified
 * since the previous successful sync.
 */
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const productionSshHost = process.env.PRODUCTION_SSH_HOST ?? 'scoutlgs_lan';
const productionPostgresService = process.env.PRODUCTION_POSTGRES_SERVICE ?? 'scoutlgs_postgres';
const localComposeFile = process.env.LOCAL_COMPOSE_FILE ?? 'docker-compose.dev.yml';
const localDatabaseService = process.env.LOCAL_DATABASE_SERVICE ?? 'postgres';
const localDatabaseName = process.env.LOCAL_DATABASE_NAME ?? 'scoutlgs';
const localDatabaseUser = process.env.LOCAL_DATABASE_USER ?? 'postgres';

function usage() {
  console.error(`Usage: pnpm sync

Refreshes local card-offer freshness and stock availability from production.
The first run streams compact stock-state rows. Later runs stream only stock
rows changed since the previous successful sync; card catalog, prices, user
lists, carts, and other production data are never copied.

Use \`pnpm sync:full\` for the previous full catalog import.

Environment variables:
  PRODUCTION_SSH_HOST          SSH host or SSH-config alias (default: scoutlgs_lan)
  PRODUCTION_POSTGRES_SERVICE  Production Postgres service name (default: scoutlgs_postgres)
  LOCAL_COMPOSE_FILE           Compose file for local Postgres (default: docker-compose.dev.yml)
  LOCAL_DATABASE_SERVICE       Local Postgres service name (default: postgres)
  LOCAL_DATABASE_NAME          Local database name (default: scoutlgs)
  LOCAL_DATABASE_USER          Local database user (default: postgres)`);
}

function waitForProcess(child, name) {
  return new Promise((resolve, reject) => {
    child.once('error', (error) => reject(new Error(`Could not start ${name}: ${error.message}`)));
    child.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${name} exited with status ${code ?? 'unknown'}.`));
    });
  });
}

function localPsqlArgs() {
  return [
    'compose', '-f', localComposeFile,
    'exec', '-T', localDatabaseService,
    'psql', '-q', '-v', 'ON_ERROR_STOP=1', '-U', localDatabaseUser,
    '-d', localDatabaseName,
  ];
}

function remoteCopyCommand(changedSince) {
  const changedSinceClause = changedSince
    ? `AND v.price_updated_at >= '${changedSince.replaceAll("'", "''")}'::timestamp - INTERVAL '2 minutes'`
    : '';
  return String.raw`set -eu
container="$(docker ps -q --filter 'name=${productionPostgresService}' | head -n 1)"
[ -n "$container" ] || {
  echo 'Production Postgres container (${productionPostgresService}) was not found.' >&2
  exit 1
}

docker exec "$container" sh -ceu '
  export PGPASSWORD="$(cat /run/secrets/postgres_password)"
  exec psql -v ON_ERROR_STOP=1 --tuples-only --no-align --username=postgres --dbname=scoutlgs -c "
    COPY (
      SELECT s.name, v.platform_variant_id, v.in_stock
      FROM card_variants v
      JOIN card_listings l ON l.id = v.card_listing_id
      JOIN stores s ON s.id = l.store_id
      WHERE v.platform_variant_id IS NOT NULL
        ${changedSinceClause}
    ) TO STDOUT WITH (FORMAT csv)
  "
'`;
}

const localCopyPreamble = String.raw`BEGIN;
CREATE TEMP TABLE production_variant_stock_state (
  store_name varchar(100) NOT NULL,
  platform_variant_id varchar(100) NOT NULL,
  in_stock boolean NOT NULL
) ON COMMIT DROP;
COPY production_variant_stock_state (store_name, platform_variant_id, in_stock) FROM STDIN WITH (FORMAT csv);
`;

const localCopyEpilogue = String.raw`\.

-- Keep existing in-stock offers visible during local development without
-- transferring the production price catalog. This is one local write pass,
-- rather than the previous full catalog dump and restore.
UPDATE card_variants
SET price_updated_at = NOW()
WHERE platform_variant_id IS NOT NULL
  AND in_stock = TRUE;

UPDATE card_variants v
SET in_stock = p.in_stock,
    price_updated_at = NOW()
FROM card_listings l
JOIN stores s ON s.id = l.store_id
JOIN production_variant_stock_state p
  ON p.store_name = s.name
WHERE v.card_listing_id = l.id
  AND p.platform_variant_id = v.platform_variant_id
  AND v.in_stock IS DISTINCT FROM p.in_stock;

INSERT INTO local_development_sync_state (sync_name, synced_at)
VALUES ('production-stock-state', NOW())
ON CONFLICT (sync_name) DO UPDATE SET synced_at = EXCLUDED.synced_at;

COMMIT;
`;

async function write(stream, data) {
  if (!stream.write(data)) await once(stream, 'drain');
}

async function captureLocalPsql(sql) {
  const child = spawn('docker', [...localPsqlArgs(), '-At', '-c', sql], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const chunks = [];
  child.stdout.on('data', (chunk) => chunks.push(chunk));
  await waitForProcess(child, 'local psql');
  return Buffer.concat(chunks).toString('utf8').trim();
}

async function readLastSuccessfulSync() {
  await captureLocalPsql(`
    CREATE TABLE IF NOT EXISTS local_development_sync_state (
      sync_name varchar(100) PRIMARY KEY,
      synced_at timestamp NOT NULL
    );
  `);
  const value = await captureLocalPsql(`
    SELECT synced_at::text
    FROM local_development_sync_state
    WHERE sync_name = 'production-stock-state';
  `);
  return value || null;
}

async function syncStockState() {
  const changedSince = await readLastSuccessfulSync();
  const local = spawn('docker', localPsqlArgs(), { stdio: ['pipe', 'inherit', 'inherit'] });
  const localComplete = waitForProcess(local, 'local psql');
  const ssh = spawn('ssh', [
    '-o', 'BatchMode=yes',
    '-o', 'ServerAliveInterval=30',
    '-o', 'ServerAliveCountMax=6',
    '-o', 'Compression=yes',
    productionSshHost,
    remoteCopyCommand(changedSince),
  ], { stdio: ['ignore', 'pipe', 'inherit'] });
  const sshComplete = waitForProcess(ssh, 'ssh');
  let stockRows = 0;

  try {
    await write(local.stdin, localCopyPreamble);
    for await (const chunk of ssh.stdout) {
      stockRows += chunk.toString('utf8').split('\n').length - 1;
      await write(local.stdin, chunk);
    }
    await sshComplete;
    await write(local.stdin, localCopyEpilogue);
    local.stdin.end();
    await localComplete;
  } catch (error) {
    // Ending COPY early makes psql abort and roll back the open transaction;
    // do not leave a half-applied stock snapshot after an SSH interruption.
    local.stdin.destroy();
    await localComplete.catch(() => {});
    await sshComplete.catch(() => {});
    throw error;
  }

  console.log(`Local offer snapshot refreshed; applied ${stockRows.toLocaleString()} production stock-state rows${changedSince ? ` changed since ${changedSince}` : ' (initial sync)'}.`);
}

if (process.argv.length !== 2) {
  usage();
  process.exitCode = 2;
} else {
  syncStockState().catch((error) => {
    console.error(`Lightweight sync failed: ${error.message}`);
    process.exitCode = 1;
  });
}
