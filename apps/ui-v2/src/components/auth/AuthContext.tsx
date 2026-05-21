import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  ensureAnonymousSession,
  type SessionResponse,
} from '@/api/auth';

type AuthStatus = 'loading' | 'ready' | 'error';

type AuthContextValue = {
  status: AuthStatus;
  session: SessionResponse | null;
  principalId: string | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<SessionResponse | null>(null);

  useEffect(() => {
    let active = true;

    ensureAnonymousSession()
      .then((nextSession) => {
        if (!active) return;
        setSession(nextSession);
        setStatus('ready');
      })
      .catch(() => {
        if (!active) return;
        setStatus('error');
      });

    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      principalId: session?.principal?.uuid ?? null,
    }),
    [session, status],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
