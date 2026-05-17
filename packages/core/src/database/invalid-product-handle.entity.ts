import { Entity, Column, ManyToOne, JoinColumn, PrimaryColumn } from 'typeorm';
import { Store } from './store.entity';

@Entity('invalid_product_handles')
export class InvalidProductHandle {
  @PrimaryColumn({ name: 'store_id' })
  storeId: number;

  @PrimaryColumn({ length: 255 })
  handle: string;

  @ManyToOne(() => Store, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'store_id' })
  store: Store;

  @Column({ name: 'last_validated_at', type: 'timestamp' })
  lastValidatedAt: Date;
}
