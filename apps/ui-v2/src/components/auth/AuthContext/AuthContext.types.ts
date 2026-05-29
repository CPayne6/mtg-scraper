import type { SessionResponse } from '@/api/auth';

export type AuthStatus = 'loading' | 'ready' | 'error';

export type AuthContextValue = {
  status: AuthStatus;
  session: SessionResponse | null;
  principalId: string | null;
};
