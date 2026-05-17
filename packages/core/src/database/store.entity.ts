import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Generated,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import type { PlatformType, StoreDiscoveryConfig } from '@scoutlgs/shared';
import { Platform } from './platform.entity';

@Entity('stores')
export class Store {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'uuid' })
  @Generated('uuid')
  uuid: string;

  @Column({ unique: true })
  name: string;

  @Column({ name: 'display_name' })
  displayName: string;

  @Column({ name: 'base_url' })
  baseUrl: string;

  @Column({ name: 'logo_url', nullable: true })
  logoUrl?: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'scraper_type' })
  scraperType: 'f2f' | '401' | 'hobbies' | 'binderpos';

  @Column({ name: 'scraper_config', type: 'jsonb', nullable: true })
  scraperConfig?: { searchPath?: string; shopifyUrl?: string; storefrontAccessToken?: string };

  @ManyToOne(() => Platform, { nullable: true })
  @JoinColumn({ name: 'platform_id' })
  platform?: Platform;

  @Column({ name: 'platform_id', nullable: true })
  platformId?: number;

  @Column({ name: 'platform_type', length: 50, nullable: true })
  platformType?: PlatformType;

  @Column({ name: 'rate_limit_per_second', type: 'int', default: 15 })
  rateLimitPerSecond: number;

  @Column({ name: 'discovery_config', type: 'jsonb', nullable: true })
  discoveryConfig?: StoreDiscoveryConfig;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
