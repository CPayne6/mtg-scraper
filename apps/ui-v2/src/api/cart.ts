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

export type BuildCheckoutLine = {
  variantId: string;
  quantity: number;
};

export type BuildCheckoutStoreInput = {
  storeKey: string;
  lines: BuildCheckoutLine[];
};

export type BuildCheckoutStoreResult = {
  storeKey: string;
  checkoutUrl: string;
};

export type BuildCheckoutResponse = {
  stores: BuildCheckoutStoreResult[];
};

export class CartApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export class CheckoutBuildError extends Error {
  status: number;
  errorCode: string;
  retryAfterSec?: number;
  storeKey?: string;

  constructor(
    message: string,
    status: number,
    errorCode: string,
    extras: { retryAfterSec?: number; storeKey?: string } = {},
  ) {
    super(message);
    this.status = status;
    this.errorCode = errorCode;
    this.retryAfterSec = extras.retryAfterSec;
    this.storeKey = extras.storeKey;
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

// X-Requested-With is the CSRF gate enforced by apps/api -- browsers preflight
// it on cross-origin requests, so a malicious form POST cannot set it. Setting
// it explicitly here keeps the gate one source-control hop away from the
// fetch.
export async function buildCheckout(
  stores: BuildCheckoutStoreInput[],
  signal?: AbortSignal,
): Promise<BuildCheckoutResponse> {
  const res = await fetch(`${API_BASE}/api/v1/checkout/build`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify({ stores }),
    signal,
  });

  if (res.ok) {
    return (await res.json()) as BuildCheckoutResponse;
  }

  let errorCode = 'unknown';
  let retryAfterSec: number | undefined;
  let storeKey: string | undefined;
  try {
    const body = (await res.json()) as {
      error?: string;
      retryAfterSec?: number;
      storeKey?: string;
    };
    if (body.error) errorCode = body.error;
    if (typeof body.retryAfterSec === 'number') retryAfterSec = body.retryAfterSec;
    if (typeof body.storeKey === 'string') storeKey = body.storeKey;
  } catch {
    // non-JSON body -- keep defaults
  }

  if (res.status === 429 && retryAfterSec == null) {
    const headerValue = res.headers.get('retry-after');
    if (headerValue) {
      const parsed = parseInt(headerValue, 10);
      if (Number.isFinite(parsed)) retryAfterSec = parsed;
    }
  }

  throw new CheckoutBuildError(
    `Checkout build failed (${res.status})`,
    res.status,
    errorCode,
    { retryAfterSec, storeKey },
  );
}
