import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStoreSyncStates1775100000000 implements MigrationInterface {
  name = 'AddStoreSyncStates1775100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "store_sync_states" (
      "store_id" integer NOT NULL, "next_sync_at" TIMESTAMP NOT NULL,
      "last_enqueued_at" TIMESTAMP, "last_successful_at" TIMESTAMP,
      "last_error" text, "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_store_sync_states_store_id" PRIMARY KEY ("store_id"),
      CONSTRAINT "FK_store_sync_states_store" FOREIGN KEY ("store_id")
        REFERENCES "stores"("id") ON DELETE CASCADE
    )`);
    await queryRunner.query('CREATE INDEX "IDX_store_sync_states_next_sync_at" ON "store_sync_states" ("next_sync_at")');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "store_sync_states"');
  }
}
