import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('card_carts')
@Index('idx_card_carts_owner_principal_uuid', ['ownerPrincipalUuid'], {
  unique: true,
})
@Index('idx_card_carts_created_at', ['createdAt'])
@Index('idx_card_carts_updated_at', ['updatedAt'])
export class CardCart {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'uuid', unique: true, default: () => 'gen_random_uuid()' })
  uuid: string;

  @Column({ name: 'owner_principal_uuid', type: 'uuid' })
  ownerPrincipalUuid: string;

  @Column({
    name: 'card_variant_ids',
    type: 'integer',
    array: true,
    default: () => "'{}'::integer[]",
  })
  cardVariantIds: number[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
