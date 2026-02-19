import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('mtg_singles_collections')
export class MtgSinglesCollection {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, length: 255 })
  slug: string;

  @Column({ name: 'display_name', length: 255, nullable: true })
  displayName?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
