const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:5000';

export type AdminStore = {
  id: number;
  uuid: string;
  name: string;
  displayName: string;
  baseUrl: string;
  isActive: boolean;
  scraperType: string;
  platformType?: string;
  rateLimitPerSecond: number;
  scraperConfig?: Record<string, unknown>;
  discoveryConfig?: Record<string, unknown>;
};

export async function fetchAdminStores(): Promise<AdminStore[]> {
  const response = await fetch(`${API_BASE}/api/v1/admin/stores`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(response.status === 404 ? 'Admin access is required.' : `Store lookup failed (${response.status}).`);
  }
  return response.json() as Promise<AdminStore[]>;
}

async function adminStoreRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  const body = await response.json().catch(() => undefined) as unknown;
  if (!response.ok) throw new Error(errorMessage(body) ?? `Request failed (${response.status}).`);
  return body as T;
}

function errorMessage(body: unknown): string | undefined {
  if (typeof body === 'string') return body;
  if (!body || typeof body !== 'object') return undefined;
  const error = body as { message?: unknown; errors?: unknown };
  if (typeof error.message === 'string') return error.message;
  if (Array.isArray(error.message)) return error.message.filter((value): value is string => typeof value === 'string').join(', ');
  if (error.message && typeof error.message === 'object') return errorMessage(error.message);
  if (Array.isArray(error.errors)) return error.errors.filter((value): value is string => typeof value === 'string').join(', ');
  return undefined;
}

export function fetchAdminStore(id: number) {
  return adminStoreRequest<AdminStore>(`/api/v1/admin/stores/${id}`);
}

export function updateAdminStore(id: number, patch: Partial<Pick<AdminStore, 'name' | 'displayName' | 'baseUrl' | 'isActive' | 'scraperType' | 'platformType' | 'rateLimitPerSecond' | 'scraperConfig' | 'discoveryConfig'>>) {
  return adminStoreRequest<AdminStore>(`/api/v1/admin/stores/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
}
