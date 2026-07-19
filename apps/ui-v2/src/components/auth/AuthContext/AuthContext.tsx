import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  ensureAnonymousSession,
  // login as loginRequest,
  logout as logoutRequest,
  resetAnonymousSessionCache,
  // signup as signupRequest,
  type SessionResponse,
} from '@/api/auth';
import type { AuthContextValue, AuthStatus } from './AuthContext.types';
import { clearRecentSearchesStorage } from '@/hooks/useRecentSearches';
// import type { LoginInput, SignupInput } from './AuthContext.types';

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

  // Email/password auth disabled until email verification ships.
  // const signup = useCallback(async (input: SignupInput) => {
  //   const next = await signupRequest(input);
  //   setSession(next);
  //   setStatus('ready');
  //   return next;
  // }, []);
  //
  // const login = useCallback(async (input: LoginInput) => {
  //   const next = await loginRequest(input);
  //   setSession(next);
  //   setStatus('ready');
  //   return next;
  // }, []);

  const logout = useCallback(async () => {
    await logoutRequest();
    clearRecentSearchesStorage();
    resetAnonymousSessionCache();
    setSession(null);
    setStatus('loading');
    try {
      const next = await ensureAnonymousSession();
      setSession(next);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      principalId: session?.principal?.uuid ?? null,
      // signup,
      // login,
      logout,
    }),
    [session, status, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
