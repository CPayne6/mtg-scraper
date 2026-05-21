export type PrincipalKind = 'anonymous' | 'user';
export type UserRole = 'user' | 'admin';

export interface PrincipalContext {
  principalUuid: string;
  kind: PrincipalKind;
  userUuid?: string;
  sessionUuid?: string;
  role?: UserRole;
}
