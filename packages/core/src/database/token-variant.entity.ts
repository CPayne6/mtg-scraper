import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { TokenListing } from './token-listing.entity';
import { CardCondition } from './card-condition.entity';

@Entity('token_variants')
@Index('idx_token_variants_listing_condition_foil', ['tokenListingId', 'conditionId', 'foil'], { unique: true })
@Index('idx_token_variants_platform_variant', ['platformVariantId'])
export class TokenVariant {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @ManyToOne(() => TokenListing, (listing) => listing.variants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'token_listing_id' })
  tokenListing: TokenListing;

  @Column({ name: 'token_listing_id' })
  tokenListingId: number;

  @ManyToOne(() => CardCondition)
  @JoinColumn({ name: 'condition_id' })
  condition: CardCondition;

  @Column({ name: 'condition_id', type: 'smallint' })
  conditionId: number;

  @Column({ default: false })
  foil: boolean;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

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
