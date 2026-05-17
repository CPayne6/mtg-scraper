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
import { CardName } from './card-name.entity';
import { ScryfallSet } from './scryfall-set.entity';

@Entity('card_printings')
@Index('idx_card_printings_set_collector', ['setId', 'collectorNumber'], { unique: true })
@Index('idx_card_printings_card_name_id', ['cardNameId'])
@Index('idx_card_printings_scryfall_id', ['scryfallId'], { unique: true })
export class CardPrinting {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => CardName)
  @JoinColumn({ name: 'card_name_id' })
  cardName: CardName;

  @Column({ name: 'card_name_id' })
  cardNameId: number;

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
