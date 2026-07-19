import type { CardSearchResponse } from '@scoutlgs/shared';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:5000';

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

export async function fetchCardByName(cardName: string, signal?: AbortSignal): Promise<CardSearchResponse> {
  const card = await fetchScryfallCard(cardName, signal);
  return fetchCard(card.oracleId, card.name, signal);
}

export async function fetchScryfallAutocomplete(query: string, signal?: AbortSignal): Promise<string[]> {
  if (!query.trim()) return [];
  const url = `https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  const data = (await res.json()) as { data?: string[] };
  return Array.isArray(data.data) ? data.data : [];
}

export async function fetchScryfallCard(name: string, signal?: AbortSignal): Promise<ScryfallCardOption> {
  const url = `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new CardFetchError(`Card lookup failed (${res.status})`, res.status);
  const card = (await res.json()) as { name?: string; oracle_id?: string };
  if (!card.name || !card.oracle_id) throw new CardFetchError('Scryfall did not return an oracle ID', 404);
  return { name: card.name, oracleId: card.oracle_id };
}
