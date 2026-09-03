import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Store } from '@scoutlgs/core';

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
  @Column({ name: 'requested_scope', nullable: true }) requestedScope?: string;
  @Column({ name: 'parser_profile', type: 'jsonb', nullable: true }) parserProfile?: Record<string, unknown>;

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
  @ManyToOne(() => Store, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'approved_store_id' }) approvedStore?: Store;

  @Column({ name: 'approved_by_user_uuid', nullable: true })
  approvedByUserUuid?: string;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
