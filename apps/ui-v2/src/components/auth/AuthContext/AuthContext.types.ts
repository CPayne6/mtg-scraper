import type { LoginInput, SessionResponse, SignupInput } from '@/api/auth';

export type { LoginInput, SignupInput };

export type AuthStatus = 'loading' | 'ready' | 'error';

export type AuthContextValue = {
  status: AuthStatus;
  session: SessionResponse | null;
  principalId: string | null;
  signup: (input: SignupInput) => Promise<SessionResponse>;
  login: (input: LoginInput) => Promise<SessionResponse>;
  logout: () => Promise<void>;
};
