const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:5000';

export type StorefrontOnboardingRun = {
  id: number;
  status: string;
  digest?: string;
  report?: Record<string, unknown>;
  proposal?: Record<string, unknown>;
  approvedStoreId?: number;
};

export type OnboardedStore = {
  id: number;
  name: string;
  displayName?: string;
  isActive: boolean;
};

export type StorefrontOnboardingInput = {
  url: string;
  proposedSlug?: string;
  scope?: string;
  currency?: string;
};

async function adminFetch<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => undefined) as unknown;
  if (!response.ok) {
    const message = errorMessage(body) ?? (response.status === 404 ? 'Admin access is required.' : `Request failed (${response.status}).`);
    throw new Error(message);
  }
  return body as T;
}

function errorMessage(body: unknown): string | undefined {
  if (typeof body === 'string') return body;
  if (!body || typeof body !== 'object') return undefined;
  const error = body as { message?: unknown; errors?: unknown };
  const message = error.message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) return message.filter((value): value is string => typeof value === 'string').join(', ');
  if (message && typeof message === 'object') {
    const nested = errorMessage(message);
    if (nested) return nested;
  }
  if (Array.isArray(error.errors)) return error.errors.filter((value): value is string => typeof value === 'string').join(', ');
  return undefined;
}

export function createStorefrontOnboardingRun(input: StorefrontOnboardingInput) {
  return adminFetch<StorefrontOnboardingRun>('/api/v1/admin/storefront-onboarding/runs', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getStorefrontOnboardingRun(id: number) {
  return adminFetch<StorefrontOnboardingRun>(`/api/v1/admin/storefront-onboarding/runs/${id}`, {
    method: 'GET',
  });
}

export function approveStorefrontOnboardingRun(id: number, digest: string) {
  return adminFetch<OnboardedStore>(`/api/v1/admin/storefront-onboarding/runs/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify({ digest }),
  });
}

export function activateStore(id: number) {
  return adminFetch<OnboardedStore>(`/api/v1/admin/stores/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ isActive: true }),
  });
}
