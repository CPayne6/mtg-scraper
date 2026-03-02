import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Store } from './store.entity';
import { MtgSinglesCollection } from './mtg-singles-collection.entity';

export type ExtractionStatus = 'pending' | 'success' | 'error';

@Entity('product_urls')
@Index('idx_product_urls_store_handle', ['storeId', 'handle'], { unique: true })
@Index('idx_product_urls_store_status', ['storeId', 'extractionStatus'])
@Index('idx_product_urls_extraction', ['extractionStatus', 'lastExtractedAt'])
@Index('idx_product_urls_collection', ['mtgSinglesCollectionId'])
export class ProductUrl {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @ManyToOne(() => Store)
  @JoinColumn({ name: 'store_id' })
  store: Store;

  @Column({ name: 'store_id' })
  storeId: number;

  @ManyToOne(() => MtgSinglesCollection)
  @JoinColumn({ name: 'mtg_singles_collection_id' })
  mtgSinglesCollection: MtgSinglesCollection;

  @Column({ name: 'mtg_singles_collection_id' })
  mtgSinglesCollectionId: number;

  @Column({ length: 255 })
  handle: string;

  @Column({ name: 'sitemap_lastmod', type: 'timestamp', nullable: true })
  sitemapLastmod?: Date;

  @Column({ name: 'image_url', type: 'text', nullable: true })
  imageUrl?: string;

  @Column({ name: 'image_title', type: 'text', nullable: true })
  imageTitle?: string;

  @Column({ name: 'discovered_at', type: 'timestamp', default: () => 'NOW()' })
  discoveredAt: Date;

  @Column({ name: 'last_extracted_at', type: 'timestamp', nullable: true })
  lastExtractedAt?: Date;

  @Column({ name: 'extraction_status', length: 20, default: 'pending' })
  extractionStatus: ExtractionStatus;

  @Column({ name: 'extraction_error', type: 'text', nullable: true })
  extractionError?: string;

  @Column({ name: 'variants_total', type: 'int', nullable: true })
  variantsTotal?: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
