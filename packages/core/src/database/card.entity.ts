import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Store } from './store.entity';
import { CardName } from './card-name.entity';
import { CardPrinting } from './card-printing.entity';
import { ProductUrl } from './product-url.entity';
import { CardVariant } from './card-variant.entity';

@Entity('card_listings')
@Index('idx_card_listings_card_name', ['cardNameId'])
@Index('idx_card_listings_store_card_name', ['storeId', 'cardNameId'])
@Index('idx_card_listings_store_product_url', ['storeId', 'productUrlId'], { unique: true })
export class CardListing {
  @PrimaryGeneratedColumn('increment')
  id: number;

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

  @Column({ name: 'product_url_id' })
  productUrlId: number;

  @Column({ name: 'raw_title', length: 500, nullable: true })
  rawTitle?: string;

  @Column({ name: 'image_url', type: 'text', nullable: true })
  imageUrl?: string;

  @Column({ length: 3, default: 'CAD' })
  currency: string;

  @Column({ name: 'name_match', length: 20, default: 'unknown' })
  nameMatch: 'exact' | 'fuzzy' | 'frontface' | 'none' | 'unknown';

  @Column({ name: 'set_match', length: 20, default: 'unknown' })
  setMatch:
    | 'code_provided'
    | 'name_exact'
    | 'name_fuzzy'
    | 'none'
    | 'unknown';

  @Column({ name: 'printing_match', length: 20, default: 'unknown' })
  printingMatch:
    | 'set_and_number'
    | 'set_only'
    | 'any'
    | 'none'
    | 'unknown';

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'price_updated_at', type: 'timestamp', default: () => 'NOW()' })
  priceUpdatedAt: Date;

  @OneToMany(() => CardVariant, (variant) => variant.cardListing)
  variants: CardVariant[];
}
