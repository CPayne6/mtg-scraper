import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDiscoveryRuns1772100000000 implements MigrationInterface {
  name = 'AddDiscoveryRuns1772100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "discovery_runs" (
        "id" SERIAL PRIMARY KEY,
        "status" varchar(20) NOT NULL DEFAULT 'running',
        "trigger" varchar(20) NOT NULL DEFAULT 'cron',
        "skip_extraction" boolean NOT NULL DEFAULT false,
        "stores_total" int NOT NULL DEFAULT 0,
        "stores_completed" int NOT NULL DEFAULT 0,
        "stores_failed" int NOT NULL DEFAULT 0,
        "total_discovered" int NOT NULL DEFAULT 0,
        "total_new_products" int NOT NULL DEFAULT 0,
        "total_updated_products" int NOT NULL DEFAULT 0,
        "total_extraction_jobs_queued" int NOT NULL DEFAULT 0,
        "total_errors" int NOT NULL DEFAULT 0,
        "extractions_succeeded" int NOT NULL DEFAULT 0,
        "extractions_failed" int NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "started_at" TIMESTAMP NOT NULL DEFAULT now(),
        "completed_at" TIMESTAMP
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_discovery_runs_status" ON "discovery_runs" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_discovery_runs_started_at" ON "discovery_runs" ("started_at" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "discovery_runs"`);
  }
}
