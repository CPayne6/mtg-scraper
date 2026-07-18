import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('card_names')
export class CardName {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 255 })
  name: string;

  @Index('idx_card_names_normalized')
  @Column({ name: 'normalized_name', length: 255, unique: true })
  normalizedName: string;

  @Column({ name: 'oracle_id', type: 'uuid', nullable: true, unique: true })
  oracleId?: string;

  @Column({ name: 'color_identity', type: 'varchar', length: 5, nullable: true })
  colorIdentity: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
