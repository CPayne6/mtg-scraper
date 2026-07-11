const STORE_LABELS = {
  "401-games": "401 Games",
  "face-to-face-games": "Face to Face Games",
};

const args = process.argv.slice(2);

if (args.includes("--help") || args.length === 0) {
  console.log(`Queue a local storefront scrape using the running scheduler service.

Usage:
  pnpm scrape:401 [--incremental] [--split-ranges=N]
  pnpm scrape:f2f [--incremental] [--split-ranges=N]
  pnpm scrape:stores [--incremental] [--split-ranges=N]

Environment:
  SCHEDULER_URL  Scheduler base URL (default: http://localhost:5001)`);
  process.exit(args.length === 0 ? 1 : 0);
}

const stores = args.filter((arg) => !arg.startsWith("--"));
const unknownStores = stores.filter((store) => !(store in STORE_LABELS));
if (unknownStores.length > 0) {
  throw new Error(`Unsupported store key(s): ${unknownStores.join(", ")}`);
}

const incremental = args.includes("--incremental");
const splitRangesArg = args.find((arg) => arg.startsWith("--split-ranges="));
const splitRanges = splitRangesArg?.split("=", 2)[1];
if (
  splitRanges !== undefined &&
  (!/^\d+$/.test(splitRanges) || Number(splitRanges) < 1)
) {
  throw new Error("--split-ranges must be a positive integer");
}

const schedulerUrl = (
  process.env.SCHEDULER_URL ?? "http://localhost:5001"
).replace(/\/$/, "");

for (const store of stores) {
  const query = new URLSearchParams({ store });
  if (incremental) query.set("incremental", "true");
  if (splitRanges) query.set("splitRanges", splitRanges);

  const url = `${schedulerUrl}/manual/storefront/trigger?${query}`;
  let response;
  try {
    response = await fetch(url, { method: "PUT" });
  } catch (error) {
    throw new Error(
      `Could not reach the scheduler at ${schedulerUrl}. Is the local development stack running?`,
      { cause: error },
    );
  }

  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `Failed to queue ${STORE_LABELS[store]} (${response.status}): ${body}`,
    );
  }

  const result = JSON.parse(body);
  console.log(
    `Queued ${STORE_LABELS[store]} scrape (${result.mode}${result.updatedSince ? `, since ${result.updatedSince}` : ""}).`,
  );
}
