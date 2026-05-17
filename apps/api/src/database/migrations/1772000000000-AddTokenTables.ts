import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTokenTables1772000000000 implements MigrationInterface {
  name = 'AddTokenTables1772000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Ensure pg_trgm extension exists (for GIN trgm index)
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    // 1. token_names
    await queryRunner.query(`
      CREATE TABLE "token_names" (
        "id" SERIAL PRIMARY KEY,
        "name" varchar(255) NOT NULL,
        "normalized_name" varchar(255) NOT NULL,
        "oracle_id" uuid UNIQUE NOT NULL,
        "layout" varchar(30),
        "type_line" text,
        "supertype" varchar(100),
        "card_type" varchar(100),
        "subtypes" varchar(255),
        "power" varchar(10),
        "toughness" varchar(10),
        "colors" varchar(20),
        "oracle_text" text,
        "keywords" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_token_names_normalized" ON "token_names" ("normalized_name")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_token_names_normalized_trgm" ON "token_names" USING gin ("normalized_name" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_token_names_card_type" ON "token_names" ("card_type")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_token_names_subtypes" ON "token_names" ("subtypes")`,
    );

    // 2. token_printings
    await queryRunner.query(`
      CREATE TABLE "token_printings" (
        "id" SERIAL PRIMARY KEY,
        "token_name_id" int NOT NULL REFERENCES "token_names"("id"),
        "scryfall_id" uuid UNIQUE NOT NULL,
        "set_id" int NOT NULL REFERENCES "sets"("id"),
        "collector_number" varchar(10) NOT NULL,
        "rarity" varchar(50),
        "image_uri" text,
        "layout" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_token_printings_set_collector" ON "token_printings" ("set_id", "collector_number")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_token_printings_token_name_id" ON "token_printings" ("token_name_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_token_printings_scryfall_id" ON "token_printings" ("scryfall_id")`,
    );

    // 3. token_listings
    await queryRunner.query(`
      CREATE TABLE "token_listings" (
        "id" SERIAL PRIMARY KEY,
        "token_name_id" int REFERENCES "token_names"("id"),
        "token_printing_id" int REFERENCES "token_printings"("id"),
        "store_id" int NOT NULL REFERENCES "stores"("id"),
        "product_url_id" int NOT NULL REFERENCES "product_urls"("id"),
        "raw_title" varchar(500),
        "image_url" text,
        "currency" varchar(3) NOT NULL DEFAULT 'CAD',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "price_updated_at" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_token_listings_store_product_url" ON "token_listings" ("store_id", "product_url_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_token_listings_token_name" ON "token_listings" ("token_name_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_token_listings_store_token_name" ON "token_listings" ("store_id", "token_name_id")`,
    );

    // 4. token_variants
    await queryRunner.query(`
      CREATE TABLE "token_variants" (
        "id" SERIAL PRIMARY KEY,
        "token_listing_id" int NOT NULL REFERENCES "token_listings"("id") ON DELETE CASCADE,
        "condition_id" smallint NOT NULL REFERENCES "card_conditions"("id"),
        "foil" boolean NOT NULL DEFAULT false,
        "price" decimal(10,2) NOT NULL,
        "quantity" int,
        "platform_variant_id" varchar(20),
        "sku" varchar(100),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "price_updated_at" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_token_variants_listing_condition_foil" ON "token_variants" ("token_listing_id", "condition_id", "foil")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_token_variants_platform_variant" ON "token_variants" ("platform_variant_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "token_variants" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "token_listings" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "token_printings" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "token_names" CASCADE`);
  }
}
