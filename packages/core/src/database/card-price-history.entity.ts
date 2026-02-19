import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  Index,
} from 'typeorm';

@Entity('card_price_history')
@Index('idx_price_history_listing_date', ['cardListingId', 'recordedAt'])
@Index('idx_price_history_printing_date', ['cardPrintingId', 'recordedAt'])
export class CardPriceHistory {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'card_listing_id', type: 'bigint' })
  cardListingId: string;

  @Column({ name: 'card_printing_id', nullable: true })
  cardPrintingId?: number;

  @Column({ name: 'store_id' })
  storeId: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  @Column({ length: 20 })
  condition: string;

  @Column({ default: false })
  foil: boolean;

  @Column({ name: 'in_stock', nullable: true })
  inStock?: boolean;

  @Column({ name: 'recorded_at', type: 'timestamp', default: () => 'NOW()' })
  recordedAt: Date;
}
