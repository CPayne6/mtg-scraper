import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('user_sessions')
@Index('IDX_user_sessions_session_uuid', ['sessionUuid'], { unique: true })
@Index('IDX_user_sessions_refresh_token_hash', ['refreshTokenHash'], {
  unique: true,
})
@Index('IDX_user_sessions_user_id', ['userId'])
export class UserSession {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, (user) => user.sessions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: number;

  @Column({
    name: 'session_uuid',
    type: 'uuid',
    default: () => 'gen_random_uuid()',
  })
  sessionUuid: string;

  @Column({ name: 'refresh_token_hash', type: 'varchar', length: 128 })
  refreshTokenHash: string;

  @Column({ name: 'ip_hash', type: 'varchar', length: 128, nullable: true })
  ipHash?: string | null;

  @Column({
    name: 'user_agent_hash',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  userAgentHash?: string | null;

  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamp', nullable: true })
  revokedAt?: Date | null;

  @Column({ name: 'last_seen_at', type: 'timestamp', nullable: true })
  lastSeenAt?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
