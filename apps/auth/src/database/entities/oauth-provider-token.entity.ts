import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OAuthAccount } from './oauth-account.entity';

@Entity('oauth_provider_tokens')
@Index('IDX_oauth_provider_tokens_oauth_account_id', ['oauthAccountId'])
export class OAuthProviderToken {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => OAuthAccount, (account) => account.providerTokens, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'oauth_account_id' })
  oauthAccount: OAuthAccount;

  @Column({ name: 'oauth_account_id' })
  oauthAccountId: number;

  @Column({ name: 'refresh_token_ciphertext', type: 'text' })
  refreshTokenCiphertext: string;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  scopes: string[];

  @Column({ name: 'expires_at', type: 'timestamp', nullable: true })
  expiresAt?: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamp', nullable: true })
  revokedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
