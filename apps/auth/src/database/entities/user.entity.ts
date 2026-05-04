import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Principal } from './principal.entity';
import { UserEmail } from './user-email.entity';
import { OAuthAccount } from './oauth-account.entity';
import { UserSession } from './user-session.entity';

@Entity('users')
@Index('IDX_users_uuid', ['uuid'], { unique: true })
@Index('IDX_users_principal_id', ['principalId'], { unique: true })
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'uuid', unique: true, default: () => 'gen_random_uuid()' })
  uuid: string;

  @OneToOne(() => Principal, (principal) => principal.user, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'principal_id' })
  principal: Principal;

  @Column({ name: 'principal_id' })
  principalId: number;

  @Column({ name: 'primary_email_id', nullable: true })
  primaryEmailId?: number | null;

  @Column({ name: 'display_name', type: 'varchar', length: 120, nullable: true })
  displayName?: string | null;

  @Column({ name: 'disabled_at', type: 'timestamp', nullable: true })
  disabledAt?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => UserEmail, (email) => email.user)
  emails: UserEmail[];

  @OneToMany(() => OAuthAccount, (account) => account.user)
  oauthAccounts: OAuthAccount[];

  @OneToMany(() => UserSession, (session) => session.user)
  sessions: UserSession[];
}
