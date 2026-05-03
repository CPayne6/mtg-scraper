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
@Index('idx_card_lists_owner_cookie', ['ownerCookie'])
@Index('idx_card_lists_owner_user_uuid', ['ownerUserUuid'])
@Index('idx_card_lists_expires_at', ['expiresAt'])
@Index('idx_card_lists_visibility', ['visibility'])
@Index('idx_card_lists_public_share_token_hash', ['publicShareTokenHash'], {
  where: '"public_share_token_hash" IS NOT NULL',
})
export class CardList {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'uuid', unique: true, default: () => 'gen_random_uuid()' })
  uuid: string;

  @Column({ name: 'owner_cookie', type: 'uuid' })
  ownerCookie: string;

  @Column({ name: 'owner_user_uuid', type: 'uuid', nullable: true })
  ownerUserUuid?: string | null;

  @Column({ type: 'varchar', length: 20, default: 'private' })
  visibility: CardListVisibility = 'private';

  @Column({ name: 'public_share_enabled', type: 'boolean', default: false })
  publicShareEnabled: boolean = false;

  @Column({ name: 'public_share_token_hash', type: 'text', nullable: true })
  publicShareTokenHash?: string | null;

  @Column({
    name: 'public_share_expires_at',
    type: 'timestamp',
    nullable: true,
  })
  publicShareExpiresAt?: Date | null;

  @Column({ name: 'claimed_at', type: 'timestamp', nullable: true })
  claimedAt?: Date | null;

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
