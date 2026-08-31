const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:5000';

export type ActiveStore = {
  id: number;
  uuid: string;
  name: string;
  displayName: string;
  logoUrl?: string;
  baseUrl: string;
};

export async function fetchActiveStores(signal?: AbortSignal): Promise<ActiveStore[]> {
  const response = await fetch(`${API_BASE}/api/v1/stores`, { signal });
  if (!response.ok) throw new Error(`Store lookup failed (${response.status})`);
  const body = await response.json() as { stores?: ActiveStore[] };
  return Array.isArray(body.stores) ? body.stores : [];
}
