import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Store } from './store.entity';

/** Immutable per-category evidence for a Conduct catalog refresh. */
@Entity('conduct_category_audits')
@Index('idx_conduct_category_audits_store_category_completed', ['storeId', 'categoryId', 'completedAt'])
export class ConductCategoryAudit {
  @PrimaryGeneratedColumn('increment') id: number;
  @ManyToOne(() => Store, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'store_id' }) store: Store;
  @Column({ name: 'store_id' }) storeId: number;
  @Column({ name: 'extraction_run_id', nullable: true }) extractionRunId?: number;
  @Column({ name: 'category_id', type: 'int', nullable: true }) categoryId?: number;
  @Column({ name: 'category_name', length: 500 }) categoryName: string;
  @Column({ default: true }) visible: boolean;
  @Column({ name: 'listing_count', type: 'int' }) listingCount: number;
  @Column({ name: 'variant_count', type: 'int' }) variantCount: number;
  @CreateDateColumn({ name: 'completed_at' }) completedAt: Date;
}
