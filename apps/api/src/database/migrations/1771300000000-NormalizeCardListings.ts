import { MigrationInterface, QueryRunner } from 'typeorm';

export class NormalizeCardListings1771300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ==========================================
    // 1. Create card_conditions lookup table
    // ==========================================
    await queryRunner.query(`
      CREATE TABLE "card_conditions" (
        "id" smallserial PRIMARY KEY,
        "code" character varying(10) NOT NULL UNIQUE,
        "display_name" character varying(50) NOT NULL,
        "sort_order" smallint NOT NULL
      )
    `);

    await queryRunner.query(`
      INSERT INTO "card_conditions" ("code", "display_name", "sort_order") VALUES
        ('nm', 'Near Mint', 1),
        ('lp', 'Lightly Played', 2),
        ('mp', 'Moderately Played', 3),
        ('hp', 'Heavily Played', 4),
        ('dmg', 'Damaged', 5),
        ('unknown', 'Unknown', 6)
    `);

    // ==========================================
    // 2. Create card_variants table (no FK on card_listing_id yet — added after dedup)
    // ==========================================
    await queryRunner.query(`
      CREATE TABLE "card_variants" (
        "id" bigserial PRIMARY KEY,
        "card_listing_id" bigint NOT NULL,
        "condition_id" smallint NOT NULL,
        "price" numeric(10,2) NOT NULL,
        "quantity" integer,
        "platform_variant_id" character varying(20),
        "sku" character varying(100),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "price_updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "FK_card_variants_condition" FOREIGN KEY ("condition_id")
          REFERENCES "card_conditions"("id")
      )
    `);

    // ==========================================
    // 3. Compute the kept listing id for each (store_id, product_url_id) group
    //    into a temp table so we can reuse it efficiently
    // ==========================================
    await queryRunner.query(`
      CREATE TEMP TABLE listing_keepers AS
      SELECT MIN(id) AS kept_id, store_id, product_url_id
      FROM card_listings
      GROUP BY store_id, product_url_id
    `);
    await queryRunner.query(`CREATE INDEX ON listing_keepers (store_id, product_url_id)`);
    await queryRunner.query(`CREATE INDEX ON listing_keepers (kept_id)`);

    // ==========================================
    // 4. Migrate data into card_variants using DISTINCT ON for dedup
    //    (much faster than ROW_NUMBER + CTE)
    // ==========================================
    await queryRunner.query(`
      INSERT INTO card_variants (card_listing_id, condition_id, price, quantity, platform_variant_id, sku, created_at, price_updated_at)
      SELECT DISTINCT ON (lk.kept_id, COALESCE(cc.id, 6))
        lk.kept_id,
        COALESCE(cc.id, 6),
        cl.price,
        cl.quantity,
        LEFT(cl.platform_variant_id, 20),
        cl.sku,
        cl.created_at,
        cl.price_updated_at
      FROM card_listings cl
      JOIN listing_keepers lk ON cl.store_id = lk.store_id AND cl.product_url_id = lk.product_url_id
      LEFT JOIN card_conditions cc ON cc.code = cl.condition
      ORDER BY lk.kept_id, COALESCE(cc.id, 6), cl.price_updated_at DESC
    `);

    // ==========================================
    // 5. Delete duplicate card_listings using efficient USING join
    // ==========================================
    await queryRunner.query(`
      DELETE FROM card_listings cl
      USING listing_keepers lk
      WHERE cl.store_id = lk.store_id
        AND cl.product_url_id = lk.product_url_id
        AND cl.id != lk.kept_id
    `);

    await queryRunner.query(`DROP TABLE listing_keepers`);

    // ==========================================
    // 6. Add FK from card_variants to card_listings (now that duplicates are gone)
    // ==========================================
    await queryRunner.query(`
      ALTER TABLE "card_variants"
      ADD CONSTRAINT "FK_card_variants_listing"
      FOREIGN KEY ("card_listing_id") REFERENCES "card_listings"("id") ON DELETE CASCADE
    `);

    // ==========================================
    // 7. Drop old indexes on card_listings
    // ==========================================
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_card_listings_store_platform_variant"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_card_listings_card_name_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_card_listings_price"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_card_listings_store_card"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_card_listings_printing_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_card_listings_updated"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_card_listings_in_stock_card_name_price"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_card_listings_in_stock_store_card_name"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_card_listings_in_stock_printing_price"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_card_listings_card_name"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_card_listings_store_card_name"`);

    // ==========================================
    // 8. Drop old columns from card_listings
    // ==========================================
    await queryRunner.query(`
      ALTER TABLE "card_listings"
        DROP COLUMN IF EXISTS "title",
        DROP COLUMN IF EXISTS "set_name",
        DROP COLUMN IF EXISTS "set_code",
        DROP COLUMN IF EXISTS "collector_number",
        DROP COLUMN IF EXISTS "product_link",
        DROP COLUMN IF EXISTS "in_stock",
        DROP COLUMN IF EXISTS "condition",
        DROP COLUMN IF EXISTS "price",
        DROP COLUMN IF EXISTS "quantity",
        DROP COLUMN IF EXISTS "sku",
        DROP COLUMN IF EXISTS "platform_variant_id",
        DROP COLUMN IF EXISTS "updated_at"
    `);

    // ==========================================
    // 9. Add new indexes on card_listings
    // ==========================================
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_card_listings_store_product_url" ON "card_listings" ("store_id", "product_url_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_card_listings_card_name" ON "card_listings" ("card_name_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_card_listings_store_card_name" ON "card_listings" ("store_id", "card_name_id")`,
    );

    // ==========================================
    // 10. Add indexes on card_variants
    // ==========================================
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_card_variants_listing_condition" ON "card_variants" ("card_listing_id", "condition_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_card_variants_platform_variant" ON "card_variants" ("platform_variant_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_card_variants_platform_variant"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_card_variants_listing_condition"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_card_listings_store_card_name"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_card_listings_card_name"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_card_listings_store_product_url"`);

    await queryRunner.query(`ALTER TABLE "card_listings" ADD COLUMN "title" character varying(500) NOT NULL DEFAULT ''`);
    await queryRunner.query(`ALTER TABLE "card_listings" ADD COLUMN "set_name" character varying(255)`);
    await queryRunner.query(`ALTER TABLE "card_listings" ADD COLUMN "set_code" character varying(10)`);
    await queryRunner.query(`ALTER TABLE "card_listings" ADD COLUMN "collector_number" character varying(10)`);
    await queryRunner.query(`ALTER TABLE "card_listings" ADD COLUMN "condition" character varying(20) NOT NULL DEFAULT 'unknown'`);
    await queryRunner.query(`ALTER TABLE "card_listings" ADD COLUMN "price" numeric(10,2) NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "card_listings" ADD COLUMN "quantity" integer`);
    await queryRunner.query(`ALTER TABLE "card_listings" ADD COLUMN "product_link" text NOT NULL DEFAULT ''`);
    await queryRunner.query(`ALTER TABLE "card_listings" ADD COLUMN "sku" character varying(100)`);
    await queryRunner.query(`ALTER TABLE "card_listings" ADD COLUMN "platform_variant_id" character varying(100)`);
    await queryRunner.query(`ALTER TABLE "card_listings" ADD COLUMN "updated_at" TIMESTAMP NOT NULL DEFAULT now()`);

    await queryRunner.query(`CREATE UNIQUE INDEX "idx_card_listings_store_platform_variant" ON "card_listings" ("store_id", "platform_variant_id")`);
    await queryRunner.query(`CREATE INDEX "idx_card_listings_card_name" ON "card_listings" ("card_name_id")`);
    await queryRunner.query(`CREATE INDEX "idx_card_listings_store_card_name" ON "card_listings" ("store_id", "card_name_id")`);

    await queryRunner.query(`DROP TABLE IF EXISTS "card_variants"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "card_conditions"`);
  }
}
