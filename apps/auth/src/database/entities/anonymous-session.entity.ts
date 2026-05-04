import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Principal } from './principal.entity';

@Entity('anonymous_sessions')
@Index('IDX_anonymous_sessions_token_hash', ['tokenHash'], { unique: true })
@Index('IDX_anonymous_sessions_principal_id', ['principalId'])
@Index('IDX_anonymous_sessions_expires_at', ['expiresAt'])
export class AnonymousSession {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Principal, (principal) => principal.anonymousSessions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'principal_id' })
  principal: Principal;

  @Column({ name: 'principal_id' })
  principalId: number;

  @Column({ name: 'token_hash', type: 'varchar', length: 128 })
  tokenHash: string;

  @Column({ name: 'ip_hash', type: 'varchar', length: 128, nullable: true })
  ipHash?: string | null;

  @Column({
    name: 'user_agent_hash',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  userAgentHash?: string | null;

  @Column({ name: 'last_seen_at', type: 'timestamp', nullable: true })
  lastSeenAt?: Date | null;

  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamp', nullable: true })
  revokedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
