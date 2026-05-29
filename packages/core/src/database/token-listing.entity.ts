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
import { TokenName } from './token-name.entity';
import { TokenPrinting } from './token-printing.entity';
import { Store } from './store.entity';
import { ProductUrl } from './product-url.entity';
import { TokenVariant } from './token-variant.entity';

@Entity('token_listings')
@Index('idx_token_listings_token_name', ['tokenNameId'])
@Index('idx_token_listings_store_token_name', ['storeId', 'tokenNameId'])
@Index('idx_token_listings_store_product_url', ['storeId', 'productUrlId'], { unique: true })
export class TokenListing {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @ManyToOne(() => TokenName, { nullable: true })
  @JoinColumn({ name: 'token_name_id' })
  tokenName: TokenName;

  @Column({ name: 'token_name_id', nullable: true })
  tokenNameId?: number;

  @ManyToOne(() => TokenPrinting, { nullable: true })
  @JoinColumn({ name: 'token_printing_id' })
  tokenPrinting?: TokenPrinting;

  @Column({ name: 'token_printing_id', nullable: true })
  tokenPrintingId?: number;

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

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'price_updated_at', type: 'timestamp', default: () => 'NOW()' })
  priceUpdatedAt: Date;

  @OneToMany(() => TokenVariant, (variant) => variant.tokenListing)
  variants: TokenVariant[];
}
