import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('anonymous_creation_quotas')
@Index('UQ_anonymous_creation_quotas_ip_window', ['ipHash', 'windowStart'], {
  unique: true,
})
export class AnonymousCreationQuota {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'ip_hash', type: 'varchar', length: 128 })
  ipHash: string;

  @Column({ name: 'window_start', type: 'date' })
  windowStart: string;

  @Column({ name: 'created_count', default: 0 })
  createdCount: number;

  @Column({ name: 'blocked_until', type: 'timestamp', nullable: true })
  blockedUntil?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
