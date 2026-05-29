import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('user_emails')
@Index('IDX_user_emails_normalized_email', ['normalizedEmail'], {
  unique: true,
})
@Index('IDX_user_emails_user_id', ['userId'])
export class UserEmail {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, (user) => user.emails, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: number;

  @Column({ type: 'varchar', length: 320 })
  email: string;

  @Column({ name: 'normalized_email', type: 'varchar', length: 320 })
  normalizedEmail: string;

  @Column({ type: 'varchar', length: 32 })
  source: string;

  @Column({ name: 'verified_at', type: 'timestamp', nullable: true })
  verifiedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
