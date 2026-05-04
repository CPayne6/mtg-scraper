import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { OAuthProviderToken } from './oauth-provider-token.entity';

@Entity('oauth_accounts')
@Index('UQ_oauth_accounts_provider_subject', ['provider', 'providerSubject'], {
  unique: true,
})
@Index('IDX_oauth_accounts_user_id', ['userId'])
export class OAuthAccount {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, (user) => user.oauthAccounts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: number;

  @Column({ type: 'varchar', length: 32 })
  provider: string;

  @Column({ name: 'provider_subject', type: 'varchar', length: 255 })
  providerSubject: string;

  @Column({ name: 'provider_email', type: 'varchar', length: 320, nullable: true })
  providerEmail?: string | null;

  @Column({ name: 'provider_email_verified', default: false })
  providerEmailVerified: boolean;

  @Column({ name: 'display_name', type: 'varchar', length: 120, nullable: true })
  displayName?: string | null;

  @Column({ name: 'avatar_url', type: 'text', nullable: true })
  avatarUrl?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => OAuthProviderToken, (token) => token.oauthAccount)
  providerTokens: OAuthProviderToken[];
}
