import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { Store } from './store.entity';

/** Durable scheduling state for one store's complete daily inventory pass. */
@Entity('store_sync_states')
export class StoreSyncState {
  @PrimaryColumn({ name: 'store_id', type: 'int' })
  storeId: number;

  @OneToOne(() => Store)
  @JoinColumn({ name: 'store_id' })
  store: Store;

  @Column({ name: 'next_sync_at', type: 'timestamp' })
  nextSyncAt: Date;

  @Column({ name: 'last_enqueued_at', type: 'timestamp', nullable: true })
  lastEnqueuedAt: Date | null;

  @Column({ name: 'last_successful_at', type: 'timestamp', nullable: true })
  lastSuccessfulAt: Date | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
