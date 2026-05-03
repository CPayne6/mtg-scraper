const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

export interface StoreDirectoryEntry {
  uuid: string
  name: string
  slug: string
  displayName: string
  baseUrl: string
  logoUrl: string | null
  platformType: string | null
  scraperType: string
  isActive: boolean
  rateLimitPerSecond: number
  discoveryEnabled: boolean | null
}

interface StoreListResponse {
  stores: StoreDirectoryEntry[]
}

function apiPath(path: string): string {
  const baseUrl = API_URL.replace(/\/$/, '')
  const prefix = baseUrl.endsWith('/api') ? '' : '/api'
  return `${baseUrl}${prefix}${path}`
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal })

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`)
  }

  return await response.json() as T
}

export async function fetchStores(
  signal?: AbortSignal,
): Promise<StoreDirectoryEntry[]> {
  const response = await fetchJson<StoreListResponse>(
    apiPath('/v1/stores'),
    signal,
  )

  return response.stores
}

export async function fetchStore(
  slug: string,
  signal?: AbortSignal,
): Promise<StoreDirectoryEntry> {
  return await fetchJson<StoreDirectoryEntry>(
    apiPath(`/v1/stores/${encodeURIComponent(slug)}`),
    signal,
  )
}
