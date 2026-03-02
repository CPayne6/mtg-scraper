import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeparateInvalidProductHandles1740100000000
  implements MigrationInterface
{
  name = 'SeparateInvalidProductHandles1740100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create the new table
    await queryRunner.query(`
      CREATE TABLE "invalid_product_handles" (
        "store_id" integer NOT NULL,
        "handle" character varying(255) NOT NULL,
        "last_validated_at" TIMESTAMP NOT NULL,
        CONSTRAINT "PK_invalid_product_handles" PRIMARY KEY ("store_id", "handle"),
        CONSTRAINT "FK_invalid_product_handles_store" FOREIGN KEY ("store_id")
          REFERENCES "stores"("id") ON DELETE CASCADE
      )
    `);

    // 2. Migrate invalid rows from product_urls
    await queryRunner.query(`
      INSERT INTO "invalid_product_handles" ("store_id", "handle", "last_validated_at")
      SELECT "store_id", "handle", COALESCE("last_validated_at", NOW())
      FROM "product_urls"
      WHERE "is_invalid" = true
    `);

    // 3. Delete invalid rows from product_urls (cascade deletes child rows in card_listings/unmatched_cards)
    await queryRunner.query(`
      DELETE FROM "product_urls" WHERE "is_invalid" = true
    `);

    // 4. Drop the columns no longer needed
    await queryRunner.query(
      `ALTER TABLE "product_urls" DROP COLUMN "is_invalid"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_urls" DROP COLUMN "last_validated_at"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-add columns (lossy — invalid rows are not restored to product_urls)
    await queryRunner.query(
      `ALTER TABLE "product_urls" ADD "is_invalid" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_urls" ADD "last_validated_at" TIMESTAMP`,
    );

    // Drop the new table
    await queryRunner.query(`DROP TABLE IF EXISTS "invalid_product_handles"`);
  }
}
