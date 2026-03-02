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
import { TokenName } from './token-name.entity';
import { ScryfallSet } from './scryfall-set.entity';

@Entity('token_printings')
@Index('idx_token_printings_set_collector', ['setId', 'collectorNumber'], { unique: true })
@Index('idx_token_printings_token_name_id', ['tokenNameId'])
@Index('idx_token_printings_scryfall_id', ['scryfallId'], { unique: true })
export class TokenPrinting {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => TokenName)
  @JoinColumn({ name: 'token_name_id' })
  tokenName: TokenName;

  @Column({ name: 'token_name_id' })
  tokenNameId: number;

  @Column({ name: 'scryfall_id', type: 'uuid' })
  scryfallId: string;

  @ManyToOne(() => ScryfallSet)
  @JoinColumn({ name: 'set_id' })
  set: ScryfallSet;

  @Column({ name: 'set_id' })
  setId: number;

  @Column({ name: 'collector_number', length: 10 })
  collectorNumber: string;

  @Column({ length: 50, nullable: true })
  rarity?: string;

  @Column({ name: 'image_uri', type: 'text', nullable: true })
  imageUri?: string;

  @Column({ type: 'text', nullable: true })
  layout?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
