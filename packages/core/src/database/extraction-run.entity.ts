import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type ExtractionRunStatus = 'running' | 'completed' | 'failed';
export type ExtractionRunTrigger = 'cron' | 'manual';

@Entity('extraction_runs')
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

  @Column({ name: 'stores_total', type: 'int', default: 0 })
  storesTotal: number;

  /** Incremented by the batch accumulator on each successful upsert batch. */
  @Column({ name: 'extractions_succeeded', type: 'int', default: 0 })
  extractionsSucceeded: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Index()
  @Column({ name: 'started_at', type: 'timestamp', default: () => 'NOW()' })
  startedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date | null;
}
