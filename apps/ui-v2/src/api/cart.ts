import type { CardWithStore } from '@scoutlgs/shared';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:5000';

export type CartItemResponse = CardWithStore & {
  id: number;
  addedAt: number;
};

export type CartResponse = {
  id: string | null;
  variantIds: number[];
  items: CartItemResponse[];
  updatedAt: string | null;
};

export class CartApiError extends Error {
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
    throw new CartApiError(await readError(response), response.status);
  }

  return (await response.json()) as T;
}

export function fetchCart(signal?: AbortSignal): Promise<CartResponse> {
  return request<CartResponse>('/api/v1/cart', { signal });
}

export function replaceCart(
  variantIds: number[],
  signal?: AbortSignal,
): Promise<CartResponse> {
  return request<CartResponse>('/api/v1/cart', {
    method: 'PUT',
    body: JSON.stringify({ variantIds }),
    signal,
  });
}

export function clearCart(signal?: AbortSignal): Promise<CartResponse> {
  return request<CartResponse>('/api/v1/cart', {
    method: 'DELETE',
    signal,
  });
}
