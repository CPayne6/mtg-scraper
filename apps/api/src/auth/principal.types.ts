export type PrincipalKind = 'anonymous' | 'user';

export interface PrincipalContext {
  principalUuid: string;
  kind: PrincipalKind;
  userUuid?: string;
  sessionUuid?: string;
}
