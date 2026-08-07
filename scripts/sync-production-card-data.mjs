#!/usr/bin/env node
/**
 * Copy the production card catalog and scraper output into the local dev DB.
 *
 * This intentionally never accesses the production auth database and does not
 * dump user-owned card lists or carts.
 */
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';

const productionSshHost = process.env.PRODUCTION_SSH_HOST ?? 'scoutlgs_lan';
const localComposeFile = process.env.LOCAL_COMPOSE_FILE ?? 'docker-compose.dev.yml';
const localDatabaseService = process.env.LOCAL_DATABASE_SERVICE ?? 'postgres';
const localDatabaseName = process.env.LOCAL_DATABASE_NAME ?? 'scoutlgs';
const localDatabaseUser = process.env.LOCAL_DATABASE_USER ?? 'postgres';

function usage() {
  console.error(`Usage: pnpm sync
   or: pnpm sync:prod

Downloads production card catalog and scraper data, then replaces the
corresponding data in the local development database.

The production auth database and all production user-owned data are excluded.
Local card lists, list entries, and carts are cleared because they can refer to
card IDs that change during the import. No other local database tables are
modified.

Environment variables:
  PRODUCTION_SSH_HOST      SSH host or SSH-config alias (default: scoutlgs_lan)
  LOCAL_COMPOSE_FILE       Compose file for the local database (default: docker-compose.dev.yml)
  LOCAL_DATABASE_SERVICE   Local Postgres service name (default: postgres)
  LOCAL_DATABASE_NAME      Local database name (default: scoutlgs)
  LOCAL_DATABASE_USER      Local database user (default: postgres)`);
}

function run(command, args, { input, output = 'inherit' } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: [input === undefined ? 'ignore' : 'pipe', output, 'inherit'],
    });

    child.once('error', (error) => reject(new Error(`Could not start ${command}: ${error.message}`)));
    child.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with status ${code ?? 'unknown'}.`));
    });

    if (input !== undefined) child.stdin.end(input);
  });
}

function dockerComposeArgs(...args) {
  return ['compose', '-f', localComposeFile, ...args];
}

async function localPsql(args, input) {
  await run('docker', dockerComposeArgs(
    'exec', '-T', localDatabaseService,
    'psql', '-v', 'ON_ERROR_STOP=1', '-U', localDatabaseUser,
    '-d', localDatabaseName, ...args,
  ), { input });
}

const remoteDumpCommand = String.raw`set -eu
container="$(docker ps -q --filter 'name=scoutlgs_postgres' | head -n 1)"
[ -n "$container" ] || {
  echo 'Production Postgres container (scoutlgs_postgres) was not found.' >&2
  exit 1
}

docker exec "$container" sh -ceu '
  export PGPASSWORD="$(cat /run/secrets/postgres_password)"
  exec pg_dump --format=custom --data-only --no-owner --no-privileges --username=postgres --dbname=scoutlgs \
    --table=public.card_conditions \
    --table=public.stores \
    --table=public.sets \
    --table=public.card_names \
    --table=public.card_printings \
    --table=public.token_names \
    --table=public.token_printings \
    --table=public.extraction_runs \
    --table=public.product_urls \
    --table=public.card_listings \
    --table=public.card_variants \
    --table=public.token_listings \
    --table=public.token_variants \
    --table=public.unmatched_cards \
    --table=public.shopify_products
'`;

const clearLocalDataSql = `TRUNCATE TABLE
  card_list_entries,
  card_lists,
  card_carts,
  shopify_products,
  card_variants,
  token_variants,
  card_listings,
  token_listings,
  unmatched_cards,
  product_urls,
  card_printings,
  token_printings,
  card_names,
  token_names,
  sets,
  stores,
  card_conditions,
  extraction_runs
RESTART IDENTITY;`;

async function downloadDump(dumpPath) {
  const ssh = spawn('ssh', [productionSshHost, remoteDumpCommand], { stdio: ['ignore', 'pipe', 'inherit'] });
  const writeDump = pipeline(ssh.stdout, createWriteStream(dumpPath));
  const sshComplete = new Promise((resolve, reject) => {
    ssh.once('error', (error) => reject(new Error(`Could not start ssh: ${error.message}`)));
    ssh.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ssh exited with status ${code ?? 'unknown'}.`));
    });
  });
  await Promise.all([writeDump, sshComplete]);
}

async function restoreDump(dumpPath) {
  const child = spawn('docker', dockerComposeArgs(
    'exec', '-T', localDatabaseService,
    'pg_restore', '--exit-on-error', '--single-transaction', '--data-only',
    '-U', localDatabaseUser, '-d', localDatabaseName,
  ), { stdio: ['pipe', 'inherit', 'inherit'] });
  const restoreComplete = new Promise((resolve, reject) => {
    child.once('error', (error) => reject(new Error(`Could not start docker: ${error.message}`)));
    child.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pg_restore exited with status ${code ?? 'unknown'}.`));
    });
  });
  await Promise.all([pipeline(createReadStream(dumpPath), child.stdin), restoreComplete]);
}

if (process.argv.length !== 2) {
  usage();
  process.exitCode = 2;
} else {
  const dumpPath = join(tmpdir(), 'scoutlgs-production-card-data.dump');
  try {
    await fs.access(localComposeFile);
    await localPsql(['-c', 'SELECT 1']);
    console.log(`Downloading card catalog and scraper data from ${productionSshHost}...`);
    await downloadDump(dumpPath);
    const dumpInfo = await fs.stat(dumpPath);
    if (dumpInfo.size === 0) throw new Error('Production dump was empty; local database was not changed.');
    console.log('Clearing local card, scraper, and user-owned list/cart data...');
    await localPsql([], clearLocalDataSql);
    console.log('Importing production card catalog and scraper data into local development...');
    await restoreDump(dumpPath);
    console.log('Local development card data is now synced from production.');
  } catch (error) {
    console.error(`Sync failed: ${error.message}`);
    process.exitCode = 1;
  }
}
