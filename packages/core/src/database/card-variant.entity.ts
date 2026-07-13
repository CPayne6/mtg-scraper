import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { CardListing } from './card.entity';
import { CardCondition } from './card-condition.entity';

@Entity('card_variants')
@Index('idx_card_variants_listing_condition_foil', ['cardListingId', 'conditionId', 'foil'], { unique: true })
@Index('idx_card_variants_platform_variant', ['platformVariantId'])
export class CardVariant {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @ManyToOne(() => CardListing, (listing) => listing.variants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'card_listing_id' })
  cardListing: CardListing;

  @Column({ name: 'card_listing_id' })
  cardListingId: number;

  @ManyToOne(() => CardCondition)
  @JoinColumn({ name: 'condition_id' })
  condition: CardCondition;

  @Column({ name: 'condition_id', type: 'smallint' })
  conditionId: number;

  @Column({ default: false })
  foil: boolean;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  @Column({ name: 'in_stock', default: true })
  inStock: boolean;

  @Column({ type: 'int', nullable: true })
  quantity?: number;

  @Column({ name: 'platform_variant_id', length: 20, nullable: true })
  platformVariantId?: string;

  @Column({ length: 100, nullable: true })
  sku?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'price_updated_at', type: 'timestamp', default: () => 'NOW()' })
  priceUpdatedAt: Date;
}
