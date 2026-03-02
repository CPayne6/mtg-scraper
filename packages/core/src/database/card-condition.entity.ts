import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('card_conditions')
export class CardCondition {
  @PrimaryGeneratedColumn({ type: 'smallint' })
  id: number;

  @Column({ length: 10, unique: true })
  code: string;

  @Column({ name: 'display_name', length: 50 })
  displayName: string;

  @Column({ name: 'sort_order', type: 'smallint' })
  sortOrder: number;
}
