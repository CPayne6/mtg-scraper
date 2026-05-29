import type { CardSearchResponse } from '@scoutlgs/shared';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:5000';

export class CardFetchError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function fetchCard(cardName: string, signal?: AbortSignal): Promise<CardSearchResponse> {
  const url = `${API_BASE}/api/card/${encodeURIComponent(cardName)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new CardFetchError(`Card lookup failed (${res.status})`, res.status);
  }
  return (await res.json()) as CardSearchResponse;
}

export async function fetchScryfallAutocomplete(query: string, signal?: AbortSignal): Promise<string[]> {
  if (!query.trim()) return [];
  const url = `https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  const data = (await res.json()) as { data?: string[] };
  return Array.isArray(data.data) ? data.data : [];
}
