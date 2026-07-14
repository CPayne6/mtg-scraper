import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { CardList } from './card-list.entity';
import { CardName } from './card-name.entity';

@Entity('card_list_entries')
@Unique('uq_card_list_entries_list_position', ['cardListId', 'position'])
@Index('idx_card_list_entries_card_name', ['cardNameId'])
export class CardListEntry {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => CardList, (list) => list.entries, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'card_list_id' })
  cardList: CardList;

  @Column({ name: 'card_list_id' })
  cardListId: number;

  @ManyToOne(() => CardName)
  @JoinColumn({ name: 'card_name_id' })
  cardName: CardName;

  @Column({ name: 'card_name_id' })
  cardNameId: number;

  @Column({ type: 'smallint' })
  position: number;

  @Column({ name: 'preferred_set_code', length: 10, nullable: true })
  preferredSetCode?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
