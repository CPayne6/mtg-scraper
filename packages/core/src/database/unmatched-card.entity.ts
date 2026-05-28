import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { Store } from './store.entity';
import { ProductUrl } from './product-url.entity';

@Entity('unmatched_cards')
@Unique('UQ_unmatched_cards_store_product_raw', ['storeId', 'productUrlId', 'rawName'])
@Index('idx_unmatched_cards_normalized_name', ['normalizedName'])
@Index('idx_unmatched_cards_created_at', ['createdAt'])
export class UnmatchedCard {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @ManyToOne(() => Store)
  @JoinColumn({ name: 'store_id' })
  store: Store;

  @Column({ name: 'store_id' })
  storeId: number;

  @ManyToOne(() => ProductUrl)
  @JoinColumn({ name: 'product_url_id' })
  productUrl: ProductUrl;

  @Column({ name: 'product_url_id' })
  productUrlId: number;

  @Column({ name: 'raw_name', length: 500 })
  rawName: string;

  @Column({ name: 'normalized_name', length: 500 })
  normalizedName: string;

  @Column({ name: 'set_name', length: 255, nullable: true })
  setName?: string;

  @Column({ name: 'set_code', length: 10, nullable: true })
  setCode?: string;

  @Column({ name: 'collector_number', length: 10, nullable: true })
  collectorNumber?: string;

  @Column({ length: 20 })
  condition: string;

  @Column({ default: false })
  foil: boolean;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  @Column({ length: 3, default: 'CAD' })
  currency: string;

  @Column({ name: 'in_stock', default: true })
  inStock: boolean;

  @Column({ type: 'int', nullable: true })
  quantity?: number;

  @Column({ name: 'image_url', type: 'text', nullable: true })
  imageUrl?: string;

  @Column({ name: 'product_link', type: 'text' })
  productLink: string;

  @Column({ length: 100, nullable: true })
  sku?: string;

  @Column({ name: 'platform_variant_id', length: 100, nullable: true })
  platformVariantId?: string;

  @Column({ name: 'retry_count', type: 'int', default: 0 })
  retryCount: number;

  @Column({ name: 'last_retry_at', type: 'timestamp', nullable: true })
  lastRetryAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
