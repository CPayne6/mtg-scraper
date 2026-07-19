import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddShopifyProductRawTitle1775000000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE shopify_products ADD COLUMN IF NOT EXISTS raw_product_title varchar(500) NULL',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE shopify_products DROP COLUMN IF EXISTS raw_product_title');
  }
}
