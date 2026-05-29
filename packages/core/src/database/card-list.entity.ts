import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { CardListEntry } from './card-list-entry.entity';

export type CardListVisibility = 'private' | 'unlisted' | 'public';

@Entity('card_lists')
@Index('idx_card_lists_owner_principal_uuid', ['ownerPrincipalUuid'])
@Index('idx_card_lists_expires_at', ['expiresAt'])
export class CardList {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'uuid', unique: true, default: () => 'gen_random_uuid()' })
  uuid: string;

  @Column({ name: 'owner_principal_uuid', type: 'uuid' })
  ownerPrincipalUuid: string;

  @Column({ type: 'varchar', length: 16, default: 'unlisted' })
  visibility: CardListVisibility;

  @Column({ length: 100 })
  name: string;

  @Column({ name: 'filter_stores', type: 'text', nullable: true })
  filterStores?: string;

  @Column({ name: 'filter_conditions', type: 'text', nullable: true })
  filterConditions?: string;

  @Column({ name: 'filter_set_code', length: 10, nullable: true })
  filterSetCode?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'expires_at', type: 'timestamp', default: () => "NOW() + INTERVAL '30 days'" })
  expiresAt: Date;

  @OneToMany(() => CardListEntry, (entry) => entry.cardList)
  entries: CardListEntry[];
}
