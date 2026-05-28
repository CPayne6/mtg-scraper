const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:5000';

export interface ListSummary {
  id: string;
  name: string;
  cardCount: number;
  filterStores: string | null;
  filterConditions: string | null;
  filterSetCode: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface CheapestVariant {
  position: number;
  cardNameId: number;
  cardName: string;
  variantId: number | null;
  price: number | null;
  foil: boolean | null;
  quantity: number | null;
  condition: string | null;
  currency: string | null;
  imageUrl: string | null;
  store: string | null;
  storeSlug: string | null;
  storeBaseUrl: string | null;
  productHandle: string | null;
  printingId: number | null;
  scryfallId: string | null;
  collectorNumber: string | null;
  rarity: string | null;
  imageUri: string | null;
  setCode: string | null;
  setName: string | null;
  totalListings: number;
}

export interface ListWithPricesResponse {
  id: string;
  name: string;
  filterStores: string | null;
  filterConditions: string | null;
  filterSetCode: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  cards: CheapestVariant[];
  unresolved: string[];
}

export interface CreateListResponse {
  id: string;
  name: string;
  cardCount: number;
  createdAt: string;
  expiresAt: string;
  warnings: string[];
}

export interface CreateListInput {
  name: string;
  cards: string[];
  filterStores?: string;
  filterConditions?: string;
  filterSetCode?: string;
}

export interface ReplaceCardsResponse {
  cardCount: number;
  warnings: string[];
}

export class ListsApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function readError(response: Response): Promise<string> {
  const text = await response.text();
  if (!text) return `Request failed: ${response.status}`;
  try {
    const body = JSON.parse(text) as { message?: unknown; error?: unknown };
    if (Array.isArray(body.message)) return body.message.join(', ');
    if (typeof body.message === 'string') return body.message;
    if (typeof body.error === 'string') return body.error;
  } catch {
    return text;
  }
  return `Request failed: ${response.status}`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    throw new ListsApiError(await readError(response), response.status);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export function fetchLists(signal?: AbortSignal): Promise<{ lists: ListSummary[] }> {
  return request<{ lists: ListSummary[] }>('/api/v1/lists', { signal });
}

export function fetchList(listId: string, signal?: AbortSignal): Promise<ListWithPricesResponse> {
  return request<ListWithPricesResponse>(
    `/api/v1/lists/${encodeURIComponent(listId)}`,
    { signal },
  );
}

export function createList(input: CreateListInput): Promise<CreateListResponse> {
  return request<CreateListResponse>('/api/v1/lists', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function replaceListCards(
  listId: string,
  cards: string[],
): Promise<ReplaceCardsResponse> {
  return request<ReplaceCardsResponse>(
    `/api/v1/lists/${encodeURIComponent(listId)}/cards`,
    {
      method: 'PUT',
      body: JSON.stringify({ cards }),
    },
  );
}

export function deleteList(listId: string): Promise<void> {
  return request<void>(`/api/v1/lists/${encodeURIComponent(listId)}`, {
    method: 'DELETE',
  });
}
