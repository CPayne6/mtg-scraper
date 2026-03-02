import { MigrationInterface, QueryRunner } from 'typeorm';

export class MoveFoilToVariants1771500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add foil column to card_variants (default false, non-null)
    await queryRunner.query(
      `ALTER TABLE "card_variants" ADD COLUMN "foil" boolean NOT NULL DEFAULT false`,
    );

    // 2. Copy foil value from parent listing to all existing variants
    await queryRunner.query(
      `UPDATE "card_variants" v
       SET "foil" = l."foil"
       FROM "card_listings" l
       WHERE v."card_listing_id" = l."id"`,
    );

    // 3. Replace unique constraint: (card_listing_id, condition_id) → (card_listing_id, condition_id, foil)
    await queryRunner.query(
      `DROP INDEX "idx_card_variants_listing_condition"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_card_variants_listing_condition_foil"
       ON "card_variants" ("card_listing_id", "condition_id", "foil")`,
    );

    // 4. Drop foil column from card_listings
    await queryRunner.query(
      `ALTER TABLE "card_listings" DROP COLUMN "foil"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Add foil column back to card_listings
    await queryRunner.query(
      `ALTER TABLE "card_listings" ADD COLUMN "foil" boolean NOT NULL DEFAULT false`,
    );

    // 2. Copy foil value from first variant back to listing
    await queryRunner.query(
      `UPDATE "card_listings" l
       SET "foil" = COALESCE(
         (SELECT v."foil" FROM "card_variants" v WHERE v."card_listing_id" = l."id" LIMIT 1),
         false
       )`,
    );

    // 3. Replace unique constraint back: (card_listing_id, condition_id, foil) → (card_listing_id, condition_id)
    await queryRunner.query(
      `DROP INDEX "idx_card_variants_listing_condition_foil"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_card_variants_listing_condition"
       ON "card_variants" ("card_listing_id", "condition_id")`,
    );

    // 4. Drop foil column from card_variants
    await queryRunner.query(
      `ALTER TABLE "card_variants" DROP COLUMN "foil"`,
    );
  }
}
