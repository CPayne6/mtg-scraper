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
import { CardName } from './card-name.entity';
import { CardPrinting } from './card-printing.entity';
import { ProductUrl } from './product-url.entity';

@Entity('card_listings')
@Index('idx_card_listings_card_name_id', ['cardNameId'])
@Index('idx_card_listings_store_card', ['storeId', 'cardNameId'])
@Index('idx_card_listings_price', ['cardNameId', 'price'])
@Index('idx_card_listings_updated', ['priceUpdatedAt'])
@Index('idx_card_listings_store_platform_variant', ['storeId', 'platformVariantId'], { unique: true })
@Index('idx_card_listings_printing_id', ['cardPrintingId'])
export class CardListing {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @ManyToOne(() => CardName, { nullable: true })
  @JoinColumn({ name: 'card_name_id' })
  cardName: CardName;

  @Column({ name: 'card_name_id', nullable: true })
  cardNameId?: number;

  @ManyToOne(() => CardPrinting, { nullable: true })
  @JoinColumn({ name: 'card_printing_id' })
  cardPrinting?: CardPrinting;

  @Column({ name: 'card_printing_id', nullable: true })
  cardPrintingId?: number;

  @ManyToOne(() => Store)
  @JoinColumn({ name: 'store_id' })
  store: Store;

  @Column({ name: 'store_id' })
  storeId: number;

  @ManyToOne(() => ProductUrl)
  @JoinColumn({ name: 'product_url_id' })
  productUrl: ProductUrl;

  @Column({ name: 'product_url_id', type: 'bigint' })
  productUrlId: string;

  @Column({ length: 500 })
  title: string;

  @Column({ name: 'raw_title', length: 500, nullable: true })
  rawTitle?: string;

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

  @Column({ name: 'price_updated_at', type: 'timestamp', default: () => 'NOW()' })
  priceUpdatedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
