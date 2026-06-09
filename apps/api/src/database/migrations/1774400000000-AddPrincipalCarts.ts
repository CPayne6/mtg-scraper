import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPrincipalCarts1774400000000 implements MigrationInterface {
  name = 'AddPrincipalCarts1774400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "card_carts" (
        "id" SERIAL NOT NULL,
        "uuid" uuid NOT NULL DEFAULT gen_random_uuid(),
        "owner_principal_uuid" uuid NOT NULL,
        "card_variant_ids" integer[] NOT NULL DEFAULT '{}'::integer[],
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_card_carts_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_card_carts_uuid" UNIQUE ("uuid")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_card_carts_owner_principal_uuid" ON "card_carts" ("owner_principal_uuid")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_card_carts_created_at" ON "card_carts" ("created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_card_carts_created_at"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_card_carts_owner_principal_uuid"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "card_carts"`);
  }
}
