import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

@Entity('platforms')
export class Platform {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, length: 50 })
  name: string;

  @Column({ name: 'display_name', length: 100, nullable: true })
  displayName?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
