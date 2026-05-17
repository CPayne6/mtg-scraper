import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type ExtractionRunStatus = 'running' | 'completed' | 'failed';
export type ExtractionRunTrigger = 'cron' | 'manual';

@Entity('discovery_runs')
export class ExtractionRun {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'running' })
  status: ExtractionRunStatus;

  @Column({ type: 'varchar', length: 20, default: 'cron' })
  trigger: ExtractionRunTrigger;

  @Column({ name: 'skip_extraction', type: 'boolean', default: false })
  skipExtraction: boolean;

  // Discovery counters
  @Column({ name: 'stores_total', type: 'int', default: 0 })
  storesTotal: number;

  @Column({ name: 'stores_completed', type: 'int', default: 0 })
  storesCompleted: number;

  @Column({ name: 'stores_failed', type: 'int', default: 0 })
  storesFailed: number;

  @Column({ name: 'total_discovered', type: 'int', default: 0 })
  totalDiscovered: number;

  @Column({ name: 'total_new_products', type: 'int', default: 0 })
  totalNewProducts: number;

  @Column({ name: 'total_updated_products', type: 'int', default: 0 })
  totalUpdatedProducts: number;

  @Column({ name: 'total_extraction_jobs_queued', type: 'int', default: 0 })
  totalExtractionJobsQueued: number;

  @Column({ name: 'total_errors', type: 'int', default: 0 })
  totalErrors: number;

  // Extraction counters
  @Column({ name: 'extractions_succeeded', type: 'int', default: 0 })
  extractionsSucceeded: number;

  @Column({ name: 'extractions_failed', type: 'int', default: 0 })
  extractionsFailed: number;

  // Timestamps
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Index()
  @Column({ name: 'started_at', type: 'timestamp', default: () => 'NOW()' })
  startedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date | null;
}
