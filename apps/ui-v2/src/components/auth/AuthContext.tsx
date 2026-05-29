import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  ensureAnonymousSession,
  login as loginRequest,
  logout as logoutRequest,
  resetAnonymousSessionCache,
  signup as signupRequest,
  type LoginInput,
  type SessionResponse,
  type SignupInput,
} from '@/api/auth';

type AuthStatus = 'loading' | 'ready' | 'error';

type AuthContextValue = {
  status: AuthStatus;
  session: SessionResponse | null;
  principalId: string | null;
  signup: (input: SignupInput) => Promise<SessionResponse>;
  login: (input: LoginInput) => Promise<SessionResponse>;
  logout: () => Promise<void>;
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

  const signup = useCallback(async (input: SignupInput) => {
    const next = await signupRequest(input);
    setSession(next);
    setStatus('ready');
    return next;
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const next = await loginRequest(input);
    setSession(next);
    setStatus('ready');
    return next;
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest();
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
      signup,
      login,
      logout,
    }),
    [session, status, signup, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
