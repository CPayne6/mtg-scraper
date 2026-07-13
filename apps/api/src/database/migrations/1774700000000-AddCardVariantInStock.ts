import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCardVariantInStock1774700000000
  implements MigrationInterface
{
  name = 'AddCardVariantInStock1774700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.card_variants
      ADD COLUMN IF NOT EXISTS in_stock boolean DEFAULT true NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_card_variants_in_stock_listing_price
      ON public.card_variants(card_listing_id, price)
      WHERE in_stock = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS public.idx_card_variants_in_stock_listing_price
    `);
    await queryRunner.query(`
      ALTER TABLE public.card_variants
      DROP COLUMN IF EXISTS in_stock
    `);
  }
}
