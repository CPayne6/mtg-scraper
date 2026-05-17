import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropPriceHistoryAndShrinkBigints1771800000000 implements MigrationInterface {
  name = 'DropPriceHistoryAndShrinkBigints1771800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Drop card_price_history table (including its indexes)
    await queryRunner.query(`DROP TABLE IF EXISTS "card_price_history" CASCADE`);

    // 2. Alter bigint columns to integer
    // Order: drop FK constraints → alter child FK columns → alter parent PK columns → re-add FK constraints

    // Drop FK constraints first
    await queryRunner.query(`ALTER TABLE "card_variants" DROP CONSTRAINT IF EXISTS "FK_card_variants_card_listing_id"`);
    await queryRunner.query(`ALTER TABLE "card_variants" DROP CONSTRAINT IF EXISTS "FK_card_variants_card_listings"`);
    await queryRunner.query(`ALTER TABLE "card_listings" DROP CONSTRAINT IF EXISTS "FK_card_listings_product_url_id"`);
    await queryRunner.query(`ALTER TABLE "card_listings" DROP CONSTRAINT IF EXISTS "FK_card_listings_product_urls"`);
    await queryRunner.query(`ALTER TABLE "unmatched_cards" DROP CONSTRAINT IF EXISTS "FK_unmatched_cards_product_url_id"`);
    await queryRunner.query(`ALTER TABLE "unmatched_cards" DROP CONSTRAINT IF EXISTS "FK_unmatched_cards_product_urls"`);

    // Drop any auto-generated FK constraint names (TypeORM naming convention)
    // Query actual constraint names and drop them
    await queryRunner.query(`
      DO $$
      DECLARE r RECORD;
      BEGIN
        FOR r IN (
          SELECT c.conname
          FROM pg_constraint c
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
          WHERE c.conrelid = 'card_variants'::regclass AND c.contype = 'f' AND a.attname = 'card_listing_id'
        ) LOOP
          EXECUTE 'ALTER TABLE card_variants DROP CONSTRAINT ' || quote_ident(r.conname);
        END LOOP;
      END $$;
    `).catch(() => { /* ignore if no constraints found */ });

    await queryRunner.query(`
      DO $$
      DECLARE r RECORD;
      BEGIN
        FOR r IN (
          SELECT c.conname
          FROM pg_constraint c
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
          WHERE c.conrelid = 'card_listings'::regclass AND c.contype = 'f' AND a.attname = 'product_url_id'
        ) LOOP
          EXECUTE 'ALTER TABLE card_listings DROP CONSTRAINT ' || quote_ident(r.conname);
        END LOOP;
      END $$;
    `).catch(() => { /* ignore if no constraints found */ });

    await queryRunner.query(`
      DO $$
      DECLARE r RECORD;
      BEGIN
        FOR r IN (
          SELECT c.conname
          FROM pg_constraint c
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
          WHERE c.conrelid = 'unmatched_cards'::regclass AND c.contype = 'f' AND a.attname = 'product_url_id'
        ) LOOP
          EXECUTE 'ALTER TABLE unmatched_cards DROP CONSTRAINT ' || quote_ident(r.conname);
        END LOOP;
      END $$;
    `).catch(() => { /* ignore if no constraints found */ });

    // Alter child FK columns
    await queryRunner.query(`ALTER TABLE "card_variants" ALTER COLUMN "card_listing_id" TYPE integer USING "card_listing_id"::integer`);
    await queryRunner.query(`ALTER TABLE "card_listings" ALTER COLUMN "product_url_id" TYPE integer USING "product_url_id"::integer`);
    await queryRunner.query(`ALTER TABLE "unmatched_cards" ALTER COLUMN "product_url_id" TYPE integer USING "product_url_id"::integer`);

    // Alter child PK columns
    await queryRunner.query(`ALTER TABLE "card_variants" ALTER COLUMN "id" TYPE integer USING "id"::integer`);
    await queryRunner.query(`ALTER TABLE "card_listings" ALTER COLUMN "id" TYPE integer USING "id"::integer`);
    await queryRunner.query(`ALTER TABLE "unmatched_cards" ALTER COLUMN "id" TYPE integer USING "id"::integer`);

    // Alter parent PK column
    await queryRunner.query(`ALTER TABLE "product_urls" ALTER COLUMN "id" TYPE integer USING "id"::integer`);

    // Update sequences to integer type
    await queryRunner.query(`ALTER SEQUENCE IF EXISTS "product_urls_id_seq" AS integer`);
    await queryRunner.query(`ALTER SEQUENCE IF EXISTS "card_listings_id_seq" AS integer`);
    await queryRunner.query(`ALTER SEQUENCE IF EXISTS "card_variants_id_seq" AS integer`);
    await queryRunner.query(`ALTER SEQUENCE IF EXISTS "unmatched_cards_id_seq" AS integer`);

    // Re-add FK constraints
    await queryRunner.query(`ALTER TABLE "card_variants" ADD CONSTRAINT "FK_card_variants_card_listing_id" FOREIGN KEY ("card_listing_id") REFERENCES "card_listings"("id") ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE "card_listings" ADD CONSTRAINT "FK_card_listings_product_url_id" FOREIGN KEY ("product_url_id") REFERENCES "product_urls"("id")`);
    await queryRunner.query(`ALTER TABLE "unmatched_cards" ADD CONSTRAINT "FK_unmatched_cards_product_url_id" FOREIGN KEY ("product_url_id") REFERENCES "product_urls"("id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Drop FK constraints
    await queryRunner.query(`ALTER TABLE "card_variants" DROP CONSTRAINT IF EXISTS "FK_card_variants_card_listing_id"`);
    await queryRunner.query(`ALTER TABLE "card_listings" DROP CONSTRAINT IF EXISTS "FK_card_listings_product_url_id"`);
    await queryRunner.query(`ALTER TABLE "unmatched_cards" DROP CONSTRAINT IF EXISTS "FK_unmatched_cards_product_url_id"`);

    // 2. Revert columns back to bigint
    await queryRunner.query(`ALTER TABLE "product_urls" ALTER COLUMN "id" TYPE bigint USING "id"::bigint`);
    await queryRunner.query(`ALTER TABLE "card_listings" ALTER COLUMN "id" TYPE bigint USING "id"::bigint`);
    await queryRunner.query(`ALTER TABLE "card_listings" ALTER COLUMN "product_url_id" TYPE bigint USING "product_url_id"::bigint`);
    await queryRunner.query(`ALTER TABLE "card_variants" ALTER COLUMN "id" TYPE bigint USING "id"::bigint`);
    await queryRunner.query(`ALTER TABLE "card_variants" ALTER COLUMN "card_listing_id" TYPE bigint USING "card_listing_id"::bigint`);
    await queryRunner.query(`ALTER TABLE "unmatched_cards" ALTER COLUMN "id" TYPE bigint USING "id"::bigint`);
    await queryRunner.query(`ALTER TABLE "unmatched_cards" ALTER COLUMN "product_url_id" TYPE bigint USING "product_url_id"::bigint`);

    // 3. Update sequences back to bigint
    await queryRunner.query(`ALTER SEQUENCE IF EXISTS "product_urls_id_seq" AS bigint`);
    await queryRunner.query(`ALTER SEQUENCE IF EXISTS "card_listings_id_seq" AS bigint`);
    await queryRunner.query(`ALTER SEQUENCE IF EXISTS "card_variants_id_seq" AS bigint`);
    await queryRunner.query(`ALTER SEQUENCE IF EXISTS "unmatched_cards_id_seq" AS bigint`);

    // 4. Re-add FK constraints
    await queryRunner.query(`ALTER TABLE "card_variants" ADD CONSTRAINT "FK_card_variants_card_listing_id" FOREIGN KEY ("card_listing_id") REFERENCES "card_listings"("id") ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE "card_listings" ADD CONSTRAINT "FK_card_listings_product_url_id" FOREIGN KEY ("product_url_id") REFERENCES "product_urls"("id")`);
    await queryRunner.query(`ALTER TABLE "unmatched_cards" ADD CONSTRAINT "FK_unmatched_cards_product_url_id" FOREIGN KEY ("product_url_id") REFERENCES "product_urls"("id")`);

    // 5. Re-create card_price_history table
    await queryRunner.query(`
      CREATE TABLE "card_price_history" (
        "id" bigserial PRIMARY KEY,
        "card_listing_id" bigint NOT NULL,
        "card_printing_id" integer,
        "store_id" integer NOT NULL,
        "price" numeric(10,2) NOT NULL,
        "condition" varchar(20) NOT NULL,
        "foil" boolean NOT NULL DEFAULT false,
        "in_stock" boolean,
        "recorded_at" timestamp NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_price_history_listing_date" ON "card_price_history" ("card_listing_id", "recorded_at")`);
    await queryRunner.query(`CREATE INDEX "idx_price_history_printing_date" ON "card_price_history" ("card_printing_id", "recorded_at")`);
  }
}
