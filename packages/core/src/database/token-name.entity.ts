import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('token_names')
@Index('idx_token_names_normalized', ['normalizedName'])
@Index('idx_token_names_card_type', ['cardType'])
@Index('idx_token_names_subtypes', ['subtypes'])
export class TokenName {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 255 })
  name: string;

  @Column({ name: 'normalized_name', length: 255 })
  normalizedName: string;

  @Column({ name: 'oracle_id', type: 'uuid', unique: true })
  oracleId: string;

  @Column({ length: 30, nullable: true })
  layout?: string;

  @Column({ name: 'type_line', type: 'text', nullable: true })
  typeLine?: string;

  @Column({ length: 100, nullable: true })
  supertype?: string;

  @Column({ name: 'card_type', length: 100, nullable: true })
  cardType?: string;

  @Column({ length: 255, nullable: true })
  subtypes?: string;

  @Column({ length: 10, nullable: true })
  power?: string;

  @Column({ length: 10, nullable: true })
  toughness?: string;

  @Column({ length: 20, nullable: true })
  colors?: string;

  @Column({ name: 'oracle_text', type: 'text', nullable: true })
  oracleText?: string;

  @Column({ type: 'text', nullable: true })
  keywords?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
