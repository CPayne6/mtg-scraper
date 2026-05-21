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

let ensureSessionPromise: Promise<SessionResponse> | null = null;

export function ensureAnonymousSession(): Promise<SessionResponse> {
  ensureSessionPromise ??= fetch(`${AUTH_BASE}/auth/anonymous-session`, {
    method: 'POST',
    credentials: 'include',
  }).then(async (res) => {
    if (!res.ok) {
      throw new AuthSessionError(
        `Anonymous session failed (${res.status})`,
        res.status,
      );
    }
    return (await res.json()) as SessionResponse;
  });

  return ensureSessionPromise;
}
