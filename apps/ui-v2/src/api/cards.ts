import type { CardSearchResponse } from '@scoutlgs/shared';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:5000';

// Scryfall asks clients to space requests out.  A shared scheduler is
// important here because list pages can mount dozens of card lookups at once.
const SCRYFALL_REQUEST_INTERVAL_MS = 125;
let nextScryfallRequestAt = 0;
const scryfallCache = new Map<string, unknown>();

function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError');
}

/** Reserve a browser Scryfall request slot. Images use this too, so all
 * Scryfall traffic in the UI shares the same eight-per-second budget. */
export async function scheduleScryfallUrl(url: string, signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) throw abortError();
  const now = Date.now();
  const startAt = Math.max(now, nextScryfallRequestAt);
  nextScryfallRequestAt = startAt + SCRYFALL_REQUEST_INTERVAL_MS;
  const wait = startAt - now;
  if (wait > 0) {
    await new Promise<void>((resolve, reject) => {
      const timer = globalThis.setTimeout(resolve, wait);
      signal?.addEventListener('abort', () => {
        globalThis.clearTimeout(timer);
        reject(abortError());
      }, { once: true });
    });
  }
  if (signal?.aborted) throw abortError();
  return url;
}

async function scryfallRequest<T>(
  key: string,
  request: (signal: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const cached = scryfallCache.get(key) as T | undefined;
  if (cached !== undefined) return cached;
  if (signal?.aborted) throw abortError();

  await scheduleScryfallUrl('', signal);
  const value = await request(signal ?? new AbortController().signal);
  scryfallCache.set(key, value);
  return value;
}

export type ScryfallCardOption = {
  name: string;
  oracleId: string;
};

export class CardFetchError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function fetchCard(oracleId: string, cardName: string, signal?: AbortSignal): Promise<CardSearchResponse> {
  const url = `${API_BASE}/api/card/${encodeURIComponent(oracleId)}/${encodeURIComponent(cardName)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new CardFetchError(`Card lookup failed (${res.status})`, res.status);
  return (await res.json()) as CardSearchResponse;
}

export async function fetchCardById(
  cardNameId: number,
  cardName: string,
  signal?: AbortSignal,
): Promise<CardSearchResponse> {
  const params = new URLSearchParams({ name: cardName });
  const url = `${API_BASE}/api/card/name-id/${encodeURIComponent(String(cardNameId))}?${params}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new CardFetchError(`Card lookup failed (${res.status})`, res.status);
  return (await res.json()) as CardSearchResponse;
}

export async function fetchScryfallAutocomplete(query: string, signal?: AbortSignal): Promise<string[]> {
  if (!query.trim()) return [];
  return scryfallRequest(`autocomplete:${query.trim().toLowerCase()}`, async (requestSignal) => {
    const url = `https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { signal: requestSignal });
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: string[] };
    return Array.isArray(data.data) ? data.data : [];
  }, signal);
}

export async function fetchScryfallCard(name: string, signal?: AbortSignal): Promise<ScryfallCardOption> {
  return scryfallRequest(`card:${name.trim().toLowerCase()}`, async (requestSignal) => {
    const url = `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`;
    const res = await fetch(url, { signal: requestSignal });
    if (!res.ok) throw new CardFetchError(`Card lookup failed (${res.status})`, res.status);
    const card = (await res.json()) as { name?: string; oracle_id?: string };
    if (!card.name || !card.oracle_id) throw new CardFetchError('Scryfall did not return an oracle ID', 404);
    return { name: card.name, oracleId: card.oracle_id };
  }, signal);
}
