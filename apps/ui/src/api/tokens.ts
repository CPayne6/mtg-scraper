const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

export interface TokenListingResult {
  id: number
  printingId: number | null
  scryfallId: string | null
  tokenName: string
  typeLine: string
  cardType: string
  subtypes: string
  power: string
  toughness: string
  colors: string
  setCode: string
  setName: string
  collectorNumber: string
  rarity?: string
  imageUri?: string
  store: string
  storeSlug: string
  price: number
  currency: string
  condition: string
  foil: boolean
  quantity?: number
  productLink: string
  imageUrl?: string
}

export interface TokenStoreCount {
  storeSlug: string
  storeName: string
  count: number
}

export interface TokenConditionCount {
  code: string
  displayName: string
  count: number
  sortOrder: number
}

export interface TokenSearchResponse {
  query: Record<string, string | undefined>
  totalListings: number
  priceStats: {
    min: number
    max: number
    avg: number
  }
  pagination: {
    page: number
    limit: number
    totalPages: number
    hasNextPage: boolean
    hasPrevPage: boolean
  }
  storeCounts: TokenStoreCount[]
  conditionCounts: TokenConditionCount[]
  results: TokenListingResult[]
}

export interface TokenSearchParams {
  name?: string
  type?: string
  subtype?: string
  power?: string
  toughness?: string
  colors?: string
  setCode?: string
  stores?: string[]
  conditions?: string[]
  page?: number
  limit?: number
}

function setStringParam(params: URLSearchParams, key: string, value?: string) {
  const trimmed = value?.trim()
  if (trimmed) {
    params.set(key, trimmed)
  }
}

export async function searchTokens(
  search: TokenSearchParams,
  signal?: AbortSignal,
): Promise<TokenSearchResponse> {
  const params = new URLSearchParams()

  setStringParam(params, 'name', search.name)
  setStringParam(params, 'type', search.type)
  setStringParam(params, 'subtype', search.subtype)
  setStringParam(params, 'power', search.power)
  setStringParam(params, 'toughness', search.toughness)
  setStringParam(params, 'colors', search.colors)
  setStringParam(params, 'setCode', search.setCode)

  if (search.stores && search.stores.length > 0) {
    params.set('stores', search.stores.join(','))
  }

  if (search.conditions && search.conditions.length > 0) {
    params.set('conditions', search.conditions.join(','))
  }

  params.set('page', String(search.page ?? 1))
  params.set('limit', String(search.limit ?? 50))

  const response = await fetch(`${API_URL}/v1/tokens/search?${params.toString()}`, { signal })

  if (!response.ok) {
    throw new Error(`Token search failed with status ${response.status}`)
  }

  return await response.json() as TokenSearchResponse
}
