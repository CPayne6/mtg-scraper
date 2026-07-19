import {
  Entity,
  Column,
  PrimaryColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Store } from './store.entity';
import { ProductUrl } from './product-url.entity';
import { CardListing } from './card.entity';

export type ShopifyProductMatchStatus =
  | 'matched'
  | 'unmatched'
  | 'token'
  | 'excluded'
  | 'pending';

/**
 * Shopify-specific product lookup table.
 *
 * Maps Shopify's globally unique numeric product ID to the generic product_url
 * and caches the card matching result. Shopify IDs are globally unique across
 * all stores, so the ID alone is the primary key.
 *
 * First extraction: full match pipeline → store result here.
 * Subsequent extractions: PK lookup → skip matcher → just update variants.
 */
@Entity('shopify_products')
@Index('idx_shopify_products_store', ['storeId'])
@Index('idx_shopify_products_product_url', ['productUrlId'])
@Index('idx_shopify_products_match_status', ['matchStatus'])
export class ShopifyProduct {
  /** Shopify's globally unique product ID (numeric part of gid://shopify/Product/X) */
  @PrimaryColumn({ name: 'shopify_product_id', type: 'bigint' })
  shopifyProductId: string; // TypeORM stores bigint as string to avoid JS precision loss

  @ManyToOne(() => Store, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'store_id' })
  store: Store;

  @Column({ name: 'store_id' })
  storeId: number;

  @ManyToOne(() => ProductUrl, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'product_url_id' })
  productUrl: ProductUrl;

  @Column({ name: 'product_url_id', nullable: true })
  productUrlId: number | null;

  @ManyToOne(() => CardListing, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'card_listing_id' })
  cardListing: CardListing;

  @Column({ name: 'card_listing_id', nullable: true })
  cardListingId: number | null;

  /** Whether this product is a token card */
  @Column({ name: 'is_token', type: 'boolean', default: false })
  isToken: boolean;

  /** Match status from first extraction */
  @Column({
    name: 'match_status',
    type: 'varchar',
    length: 20,
    default: 'pending',
  })
  matchStatus: ShopifyProductMatchStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
