import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('jwt_signing_keys')
@Index('IDX_jwt_signing_keys_kid', ['kid'], { unique: true })
export class JwtSigningKey {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 120 })
  kid: string;

  @Column({ type: 'varchar', length: 32, default: 'EdDSA' })
  alg: string;

  @Column({ name: 'public_key_pem', type: 'text' })
  publicKeyPem: string;

  @Column({ name: 'private_key_file', type: 'text', nullable: true })
  privateKeyFile?: string | null;

  @Column({ default: true })
  active: boolean;

  @Column({ name: 'not_before', type: 'timestamp', default: () => 'now()' })
  notBefore: Date;

  @Column({ name: 'retired_at', type: 'timestamp', nullable: true })
  retiredAt?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
