const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

export interface ListSummary {
  id: string
  name: string
  cardCount: number
  filterStores: string | null
  filterConditions: string | null
  filterSetCode: string | null
  createdAt: string
  updatedAt: string
  expiresAt: string
}

export interface CheapestVariant {
  position: number
  cardNameId: number
  cardName: string
  variantId: number | null
  price: number | null
  foil: boolean | null
  quantity: number | null
  condition: string | null
  currency: string | null
  imageUrl: string | null
  store: string | null
  storeSlug: string | null
  storeBaseUrl: string | null
  productHandle: string | null
  printingId: number | null
  scryfallId: string | null
  collectorNumber: string | null
  rarity: string | null
  imageUri: string | null
  setCode: string | null
  setName: string | null
  totalListings: number
}

export interface ListWithPricesResponse {
  id: string
  name: string
  filterStores: string | null
  filterConditions: string | null
  filterSetCode: string | null
  createdAt: string
  updatedAt: string
  expiresAt: string
  cards: CheapestVariant[]
  unresolved: string[]
}

export interface CreateListResponse {
  id: string
  name: string
  cardCount: number
  createdAt: string
  expiresAt: string
  warnings: string[]
}

export interface GetListsResponse {
  lists: ListSummary[]
}

export interface CreateListInput {
  name: string
  cards: string[]
  filterStores?: string
  filterConditions?: string
  filterSetCode?: string
}

export interface UpdateListFiltersInput {
  filterStores?: string
  filterConditions?: string
  filterSetCode?: string
}

async function getErrorMessage(response: Response): Promise<string> {
  const text = await response.text()
  if (!text) return `Request failed: ${response.status}`

  try {
    const body = JSON.parse(text) as { message?: unknown; error?: unknown }
    if (Array.isArray(body.message)) return body.message.join(', ')
    if (typeof body.message === 'string') return body.message
    if (typeof body.error === 'string') return body.error
  } catch {
    return text
  }

  return `Request failed: ${response.status}`
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  })

  if (!response.ok) {
    throw new Error(await getErrorMessage(response))
  }

  if (response.status === 204) {
    return undefined as T
  }

  return await response.json() as T
}

export function createList(input: CreateListInput): Promise<CreateListResponse> {
  return apiRequest<CreateListResponse>('/v1/lists', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function getLists(signal?: AbortSignal): Promise<GetListsResponse> {
  return apiRequest<GetListsResponse>('/v1/lists', { signal })
}

export function getList(listId: string, signal?: AbortSignal): Promise<ListWithPricesResponse> {
  return apiRequest<ListWithPricesResponse>(`/v1/lists/${encodeURIComponent(listId)}`, { signal })
}

export function updateListFilters(
  listId: string,
  input: UpdateListFiltersInput,
): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/v1/lists/${encodeURIComponent(listId)}/filters`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function deleteList(listId: string): Promise<void> {
  return apiRequest<void>(`/v1/lists/${encodeURIComponent(listId)}`, {
    method: 'DELETE',
  })
}
