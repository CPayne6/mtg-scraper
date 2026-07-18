const AUTH_BASE = import.meta.env.VITE_AUTH_URL ?? 'http://localhost:5002';

export type PrincipalKind = 'anonymous' | 'user';

export type SessionResponse = {
  authenticated: boolean;
  principal: null | {
    uuid: string;
    kind: PrincipalKind;
  };
  user: null | {
    uuid: string;
    displayName: string | null;
    email: string | null;
    role: string;
  };
};

export class AuthSessionError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function authFetch<T>(
  path: string,
  init: RequestInit,
  defaultErrorMessage: string,
): Promise<T> {
  const res = await fetch(`${AUTH_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    let message = defaultErrorMessage;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (Array.isArray(body.message)) {
        message = body.message.join(', ');
      } else if (typeof body.message === 'string' && body.message) {
        message = body.message;
      }
    } catch {
      // non-JSON error body; fall back to default
    }
    throw new AuthSessionError(message, res.status);
  }

  return (await res.json()) as T;
}

let ensureSessionPromise: Promise<SessionResponse> | null = null;

export function ensureAnonymousSession(): Promise<SessionResponse> {
  ensureSessionPromise ??= authFetch<SessionResponse>(
    '/auth/anonymous-session',
    { method: 'POST' },
    'Anonymous session failed',
  ).catch((err) => {
    ensureSessionPromise = null;
    throw err;
  });

  return ensureSessionPromise;
}

export function resetAnonymousSessionCache(): void {
  ensureSessionPromise = null;
}

export function getSession(): Promise<SessionResponse> {
  return authFetch<SessionResponse>(
    '/auth/session',
    { method: 'GET' },
    'Failed to load session',
  );
}

export type DeliveryAddress = { address1: string; address2?: string; city: string; province: string; postalCode: string; countryCode: 'CA' };
export function getDeliveryAddress(): Promise<{ address: DeliveryAddress | null }> { return authFetch('/auth/delivery-address', { method: 'GET' }, 'Failed to load saved address'); }
export function saveDeliveryAddress(address: DeliveryAddress): Promise<{ address: DeliveryAddress }> { return authFetch('/auth/delivery-address', { method: 'PUT', body: JSON.stringify(address) }, 'Failed to save address'); }
export function removeDeliveryAddress(): Promise<{ address: null }> { return authFetch('/auth/delivery-address', { method: 'DELETE' }, 'Failed to remove saved address'); }

// Email/password auth is disabled until email verification is in place.
// Keep the input types and helpers around so they can be re-enabled later.
// export type SignupInput = {
//   email: string;
//   password: string;
//   displayName?: string;
// };
//
// export function signup(input: SignupInput): Promise<SessionResponse> {
//   const body: SignupInput = {
//     email: input.email,
//     password: input.password,
//   };
//   if (input.displayName && input.displayName.trim()) {
//     body.displayName = input.displayName.trim();
//   }
//
//   return authFetch<SessionResponse>(
//     '/auth/signup',
//     { method: 'POST', body: JSON.stringify(body) },
//     'Signup failed',
//   );
// }
//
// export type LoginInput = {
//   email: string;
//   password: string;
// };
//
// export function login(input: LoginInput): Promise<SessionResponse> {
//   return authFetch<SessionResponse>(
//     '/auth/login',
//     { method: 'POST', body: JSON.stringify(input) },
//     'Login failed',
//   );
// }

export function googleSignInUrl(redirect?: string): string {
  const trimmed = redirect?.trim();
  if (trimmed && trimmed.startsWith('/')) {
    return `${AUTH_BASE}/auth/google?redirect=${encodeURIComponent(trimmed)}`;
  }
  return `${AUTH_BASE}/auth/google`;
}

export function logout(): Promise<{ success: true }> {
  return authFetch<{ success: true }>(
    '/auth/logout',
    { method: 'POST' },
    'Logout failed',
  );
}
