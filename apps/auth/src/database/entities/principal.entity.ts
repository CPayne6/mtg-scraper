import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AnonymousSession } from './anonymous-session.entity';
import { User } from './user.entity';

export type PrincipalKind = 'anonymous' | 'user';

@Entity('principals')
@Index('IDX_principals_uuid', ['uuid'], { unique: true })
@Index('IDX_principals_kind', ['kind'])
@Index('IDX_principals_expires_at', ['expiresAt'])
export class Principal {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'uuid', unique: true, default: () => 'gen_random_uuid()' })
  uuid: string;

  @Column({ type: 'varchar', length: 16 })
  kind: PrincipalKind;

  @Column({ name: 'last_seen_at', type: 'timestamp', nullable: true })
  lastSeenAt?: Date | null;

  @Column({ name: 'expires_at', type: 'timestamp', nullable: true })
  expiresAt?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => AnonymousSession, (session) => session.principal)
  anonymousSessions: AnonymousSession[];

  @OneToOne(() => User, (user) => user.principal)
  user?: User;
}
