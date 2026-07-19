import type { SessionResponse } from '@/api/auth';
// Email/password auth is disabled until email verification ships. The types
// below are kept commented for reference and to be restored alongside the
// signup/login endpoints.
// import type { LoginInput, SignupInput } from '@/api/auth';
//
// export type { LoginInput, SignupInput };

export type AuthStatus = 'loading' | 'ready' | 'error';

export type AuthContextValue = {
  status: AuthStatus;
  session: SessionResponse | null;
  principalId: string | null;
  // signup: (input: SignupInput) => Promise<SessionResponse>;
  // login: (input: LoginInput) => Promise<SessionResponse>;
  logout: () => Promise<void>;
};
