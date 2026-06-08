import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCheckoutBuilds1774500000000 implements MigrationInterface {
  name = 'CreateCheckoutBuilds1774500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "checkout_builds" (
        "id" BIGSERIAL PRIMARY KEY,
        "principal_uuid" UUID NOT NULL,
        "principal_kind" VARCHAR(16) NOT NULL,
        "ip_hash" VARCHAR(64) NOT NULL,
        "ua_hash" VARCHAR(64),
        "requested_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "store_count" INT NOT NULL,
        "total_lines" INT NOT NULL,
        "total_succeeded_stores" INT NOT NULL DEFAULT 0,
        "total_failed_stores" INT NOT NULL DEFAULT 0,
        "request_duration_ms" INT NOT NULL,
        "error_class" VARCHAR(32)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_checkout_builds_principal_requested" ON "checkout_builds" ("principal_uuid", "requested_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_checkout_builds_ip_requested" ON "checkout_builds" ("ip_hash", "requested_at" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_checkout_builds_ip_requested"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_checkout_builds_principal_requested"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "checkout_builds"`);
  }
}
