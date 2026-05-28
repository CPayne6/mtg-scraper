import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add indexes on foreign-key columns so cascade deletes don't full-scan
 * child tables, and so common lookups by FK use an index.
 *
 * Two classes of indexes:
 *
 *   1. Cascade-target FKs (everything that points into card_listings or
 *      product_urls). Without these, deleting a parent row triggers a
 *      full-scan of every child table per row deleted. A store-wipe
 *      DELETE on product_urls with 110K rows × full-scan of 280K
 *      card_listings = O(N²) — minutes per wipe.
 *
 *   2. Application lookup index on card_listings(card_printing_id) for
 *      "show all stores selling printing X" queries on the API.
 *
 * Indexes on FK columns that are usually NULL (card_listings.card_printing_id,
 * shopify_products.card_listing_id) use a partial WHERE clause to stay small.
 */
export class AddListingForeignKeyIndexes1774200000000
  implements MigrationInterface
{
  name = 'AddListingForeignKeyIndexes1774200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Cascade target: card_listings ← shopify_products.card_listing_id
    // (was causing the original slow card_listings delete)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_shopify_products_card_listing_id
      ON shopify_products(card_listing_id)
      WHERE card_listing_id IS NOT NULL
    `);

    // API lookup: "find all listings of this printing across stores"
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_card_listings_card_printing
      ON card_listings(card_printing_id)
      WHERE card_printing_id IS NOT NULL
    `);

    // Cascade target: product_urls ← card_listings.product_url_id
    // Existing composite idx leads with store_id, so doesn't help cascade.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_card_listings_product_url_id
      ON card_listings(product_url_id)
    `);

    // Cascade target: product_urls ← unmatched_cards.product_url_id
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_unmatched_cards_product_url_id
      ON unmatched_cards(product_url_id)
    `);

    // Cascade target: product_urls ← token_listings.product_url_id
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_token_listings_product_url_id
      ON token_listings(product_url_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_token_listings_product_url_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_unmatched_cards_product_url_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_card_listings_product_url_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_card_listings_card_printing`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_shopify_products_card_listing_id`);
  }
}
