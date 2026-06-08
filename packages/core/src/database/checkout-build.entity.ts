import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

// Append-only audit log of every POST /api/v1/checkout/build invocation.
// Drives abuse-detection queries -- the indexes are tuned for "what did this
// principal/IP do in the last N minutes" lookups, not analytics.
@Entity('checkout_builds')
@Index('idx_checkout_builds_principal_requested', ['principalUuid', 'requestedAt'])
@Index('idx_checkout_builds_ip_requested', ['ipHash', 'requestedAt'])
export class CheckoutBuild {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ name: 'principal_uuid', type: 'uuid' })
  principalUuid: string;

  @Column({ name: 'principal_kind', length: 16 })
  principalKind: 'anonymous' | 'user';

  @Column({ name: 'ip_hash', length: 64 })
  ipHash: string;

  @Column({ name: 'ua_hash', length: 64, nullable: true })
  uaHash?: string;

  @CreateDateColumn({ name: 'requested_at', type: 'timestamptz' })
  requestedAt: Date;

  @Column({ name: 'store_count', type: 'int' })
  storeCount: number;

  @Column({ name: 'total_lines', type: 'int' })
  totalLines: number;

  @Column({ name: 'total_succeeded_stores', type: 'int', default: 0 })
  totalSucceededStores: number;

  @Column({ name: 'total_failed_stores', type: 'int', default: 0 })
  totalFailedStores: number;

  @Column({ name: 'request_duration_ms', type: 'int' })
  requestDurationMs: number;

  // 'unknown' covers any 5xx; null = success (200). 4xx -- 'validation',
  // 'rate-limited', 'csrf'. Sanitized at response boundary.
  @Column({ name: 'error_class', length: 32, nullable: true })
  errorClass?: string;
}
