#!/usr/bin/env node
/**
 * Backfill production card color identities from Scryfall without running
 * application seed code (or installing seed-only packages) in production.
 *
 * Scryfall is downloaded and parsed on the local machine. The resulting COPY
 * stream is sent over SSH directly to psql inside the production Postgres
 * container, where the database secret already exists.
 */
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";

const productionSshHost = process.env.PRODUCTION_SSH_HOST ?? "scoutlgs_lan";
const productionPostgresService = process.env.PRODUCTION_POSTGRES_SERVICE ?? "scoutlgs_postgres";
const SCRYFALL_HEADERS = {
  "User-Agent": "ScoutLGS/1.0 (https://github.com/CPayne6/mtg-scraper)",
  Accept: "application/json",
};
const PLAYABLE_LAYOUTS = new Set([
  "normal", "split", "flip", "transform", "modal_dfc", "meld", "leveler", "class", "saga", "adventure", "mutate", "prototype", "battle", "case", "planar", "scheme", "vanguard", "phenomenon", "augment", "host",
]);

function usage() {
  console.error(`Usage: pnpm seed:prod:scryfall --confirm

Downloads Scryfall's oracle-card bulk data locally, then backfills color
identities for existing production card names. Production does not run Node or
download Scryfall data, and the command has no npm package dependencies.

Environment variables:
  PRODUCTION_SSH_HOST          SSH host or SSH-config alias (default: scoutlgs_lan)
  PRODUCTION_POSTGRES_SERVICE  Docker Postgres service name (default: scoutlgs_postgres)`);
}

function normalizeCardName(name) {
  return name.toLowerCase().trim().replace(/\s+/g, " ").replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
}

function normalizeColorIdentity(colors) {
  const values = Array.isArray(colors) ? colors : [];
  return "WUBRG".split("").filter((color) => values.includes(color)).join("");
}

function copyEscape(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/\t/g, "\\t").replace(/\n/g, "\\n").replace(/\r/g, "\\r");
}

async function getOracleCardsDownloadUrl() {
  const response = await fetch("https://api.scryfall.com/bulk-data/oracle_cards", { headers: SCRYFALL_HEADERS });
  if (!response.ok) throw new Error(`Scryfall bulk-data request failed with HTTP ${response.status}.`);
  const data = await response.json();
  if (!data.jsonl_download_uri) throw new Error("Scryfall did not return an oracle-cards JSONL download URL.");
  return data.jsonl_download_uri;
}

function productionPsqlCommand() {
  return String.raw`set -eu
container="$(docker ps -q --filter 'name=${productionPostgresService}' | head -n 1)"
[ -n "$container" ] || {
  echo 'Production Postgres container was not found.' >&2
  exit 1
}

docker exec -i "$container" sh -ceu '
  export PGPASSWORD="$(cat /run/secrets/postgres_password)"
  exec psql -v ON_ERROR_STOP=1 --username=postgres --dbname=scoutlgs
'`;
}

async function write(stream, value) {
  if (!stream.write(value)) await once(stream, "drain");
}

function waitForProcess(child, name) {
  return new Promise((resolve, reject) => {
    child.once("error", (error) => reject(new Error(`Could not start ${name}: ${error.message}`)));
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${name} exited with status ${code ?? "unknown"}.`));
    });
  });
}

async function backfill() {
  console.log(`Connecting to production Postgres through ${productionSshHost}...`);
  const ssh = spawn("ssh", ["-o", "ServerAliveInterval=30", "-o", "ServerAliveCountMax=120", productionSshHost, productionPsqlCommand()], { stdio: ["pipe", "inherit", "inherit"] });
  const sshComplete = waitForProcess(ssh, "ssh");
  try {
    await write(ssh.stdin, `BEGIN;
CREATE TEMP TABLE staging_card_color_identities (
  normalized_name text NOT NULL,
  color_identity varchar(5) NOT NULL
) ON COMMIT DROP;
COPY staging_card_color_identities (normalized_name, color_identity) FROM STDIN;
`);
    console.log("Downloading and parsing Scryfall oracle cards locally...");
    const downloadUrl = await getOracleCardsDownloadUrl();
    const response = await fetch(downloadUrl, { headers: SCRYFALL_HEADERS });
    if (!response.ok || !response.body) throw new Error(`Scryfall bulk download failed with HTTP ${response.status}.`);
    let rows = 0;
    const cardLines = createInterface({ input: Readable.fromWeb(response.body).pipe(createGunzip()), crlfDelay: Infinity });
    for await (const line of cardLines) {
      if (!line) continue;
      const card = JSON.parse(line);
      if (!PLAYABLE_LAYOUTS.has(card.layout) || typeof card.name !== "string") continue;
      await write(ssh.stdin, `${copyEscape(normalizeCardName(card.name))}\t${copyEscape(normalizeColorIdentity(card.color_identity))}\n`);
      rows += 1;
    }
    await write(ssh.stdin, `\\.
WITH unique_cards AS (
  SELECT DISTINCT ON (normalized_name) normalized_name, color_identity
  FROM staging_card_color_identities
  ORDER BY normalized_name
)
UPDATE card_names AS card_name
SET color_identity = source.color_identity,
    updated_at = NOW()
FROM unique_cards AS source
WHERE card_name.normalized_name = source.normalized_name
  AND card_name.color_identity IS DISTINCT FROM source.color_identity;
COMMIT;
`);
    ssh.stdin.end();
    await sshComplete;
    console.log(`Production color-identity backfill complete (${rows.toLocaleString()} Scryfall cards processed locally).`);
  } catch (error) {
    // Ending psql's input rolls back its open transaction if the local Scryfall
    // download or SSH connection fails before COMMIT.
    ssh.stdin.destroy();
    await sshComplete.catch(() => {});
    throw error;
  }
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  usage();
} else if (process.argv.length !== 3 || process.argv[2] !== "--confirm") {
  usage();
  process.exitCode = 2;
} else {
  backfill().catch((error) => {
    console.error(`Production Scryfall backfill failed: ${error.message}`);
    process.exitCode = 1;
  });
}
