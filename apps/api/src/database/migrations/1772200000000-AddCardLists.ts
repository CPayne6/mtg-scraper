import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCardLists1772200000000 implements MigrationInterface {
  name = 'AddCardLists1772200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "card_lists" (
        "id" SERIAL PRIMARY KEY,
        "uuid" uuid NOT NULL DEFAULT gen_random_uuid(),
        "owner_principal_uuid" uuid NOT NULL,
        "visibility" varchar(16) NOT NULL DEFAULT 'unlisted',
        "name" varchar(100) NOT NULL,
        "filter_stores" text,
        "filter_conditions" text,
        "filter_set_code" varchar(10),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "expires_at" TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '30 days')
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_card_lists_uuid" ON "card_lists" ("uuid")`,
    );
    await queryRunner.query(
      `ALTER TABLE "card_lists" ADD CONSTRAINT "CHK_card_lists_visibility" CHECK ("visibility" IN ('private', 'unlisted', 'public'))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_card_lists_owner_principal_uuid" ON "card_lists" ("owner_principal_uuid")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_card_lists_expires_at" ON "card_lists" ("expires_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE "card_list_entries" (
        "id" SERIAL PRIMARY KEY,
        "card_list_id" int NOT NULL REFERENCES "card_lists"("id") ON DELETE CASCADE,
        "card_name_id" int NOT NULL REFERENCES "card_names"("id"),
        "position" smallint NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_card_list_entries_list_position" ON "card_list_entries" ("card_list_id", "position")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_card_list_entries_card_name" ON "card_list_entries" ("card_name_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "card_list_entries" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "card_lists" CASCADE`);
  }
}
