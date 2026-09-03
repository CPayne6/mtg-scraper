import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type StorefrontOnboardingRunStatus =
  | 'running' | 'proposal-ready' | 'rejected' | 'failed' | 'approved';

@Entity('storefront_onboarding_runs')
export class StorefrontOnboardingRun {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'requested_url' })
  requestedUrl: string;

  @Column({ name: 'requested_slug', nullable: true })
  requestedSlug?: string;

  @Column({ type: 'varchar' })
  status: StorefrontOnboardingRunStatus;

  @Column({ type: 'jsonb', nullable: true })
  report?: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  proposal?: Record<string, unknown>;

  @Column({ nullable: true })
  digest?: string;

  @Column({ name: 'approved_store_id', type: 'int', nullable: true })
  approvedStoreId?: number;

  @Column({ name: 'approved_by_user_uuid', nullable: true })
  approvedByUserUuid?: string;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
