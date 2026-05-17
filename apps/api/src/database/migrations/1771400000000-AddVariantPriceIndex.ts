import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVariantPriceIndex1771400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "idx_card_variants_listing_price" ON "card_variants" ("card_listing_id", "price")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_card_variants_listing_price"`,
    );
  }
}
