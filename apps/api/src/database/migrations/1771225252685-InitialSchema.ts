import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1771225252685 implements MigrationInterface {
  name = 'InitialSchema1771225252685';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Extensions
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // ============== platforms ==============
    await queryRunner.query(`
      CREATE TABLE "platforms" (
        "id" SERIAL NOT NULL,
        "name" character varying(50) NOT NULL,
        "display_name" character varying(100),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_platforms_name" UNIQUE ("name"),
        CONSTRAINT "PK_platforms" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      INSERT INTO "platforms" ("name", "display_name") VALUES
        ('shopify', 'Shopify'),
        ('conduct_commerce', 'ConductCommerce')
    `);

    // ============== stores ==============
    await queryRunner.query(`
      CREATE TABLE "stores" (
        "id" SERIAL NOT NULL,
        "uuid" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "display_name" character varying NOT NULL,
        "base_url" character varying NOT NULL,
        "logo_url" character varying,
        "is_active" boolean NOT NULL DEFAULT true,
        "scraper_type" character varying NOT NULL,
        "scraper_config" jsonb,
        "platform_id" integer,
        "platform_type" character varying(50),
        "discovery_config" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_stores_name" UNIQUE ("name"),
        CONSTRAINT "PK_stores" PRIMARY KEY ("id"),
        CONSTRAINT "FK_stores_platform" FOREIGN KEY ("platform_id") REFERENCES "platforms"("id") ON DELETE SET NULL
      )
    `);

    // ============== mtg_singles_collections ==============
    await queryRunner.query(`
      CREATE TABLE "mtg_singles_collections" (
        "id" SERIAL NOT NULL,
        "slug" character varying(255) NOT NULL,
        "display_name" character varying(255),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_mtg_singles_collections_slug" UNIQUE ("slug"),
        CONSTRAINT "PK_mtg_singles_collections" PRIMARY KEY ("id")
      )
    `);

    // ============== card_names ==============
    await queryRunner.query(`
      CREATE TABLE "card_names" (
        "id" SERIAL NOT NULL,
        "name" character varying(255) NOT NULL,
        "normalized_name" character varying(255) NOT NULL,
        "oracle_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_card_names_normalized" UNIQUE ("normalized_name"),
        CONSTRAINT "UQ_card_names_oracle_id" UNIQUE ("oracle_id"),
        CONSTRAINT "PK_card_names" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_card_names_normalized" ON "card_names" ("normalized_name")`);
    await queryRunner.query(`CREATE INDEX "idx_card_names_name_trgm" ON "card_names" USING gin ("name" gin_trgm_ops)`);
    await queryRunner.query(`CREATE INDEX "idx_card_names_normalized_name_trgm" ON "card_names" USING gin ("normalized_name" gin_trgm_ops)`);

    // ============== sets (Scryfall sets) ==============
    await queryRunner.query(`
      CREATE TABLE "sets" (
        "id" SERIAL NOT NULL,
        "code" character varying(10) NOT NULL,
        "name" character varying(255) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_sets_code" UNIQUE ("code"),
        CONSTRAINT "PK_sets" PRIMARY KEY ("id")
      )
    `);

    // ============== card_printings ==============
    await queryRunner.query(`
      CREATE TABLE "card_printings" (
        "id" SERIAL NOT NULL,
        "card_name_id" integer NOT NULL,
        "scryfall_id" uuid NOT NULL,
        "set_id" integer NOT NULL,
        "collector_number" character varying(10) NOT NULL,
        "rarity" character varying(50),
        "image_uri" text,
        "layout" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_card_printings" PRIMARY KEY ("id"),
        CONSTRAINT "FK_card_printings_card_name" FOREIGN KEY ("card_name_id") REFERENCES "card_names"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_card_printings_set" FOREIGN KEY ("set_id") REFERENCES "sets"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`CREATE UNIQUE INDEX "idx_card_printings_scryfall_id" ON "card_printings" ("scryfall_id")`);
    await queryRunner.query(`CREATE INDEX "idx_card_printings_card_name_id" ON "card_printings" ("card_name_id")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "idx_card_printings_set_collector" ON "card_printings" ("set_id", "collector_number")`);

    // ============== product_urls ==============
    await queryRunner.query(`
      CREATE TABLE "product_urls" (
        "id" BIGSERIAL NOT NULL,
        "store_id" integer NOT NULL,
        "mtg_singles_collection_id" integer NOT NULL,
        "handle" character varying(255) NOT NULL,
        "sitemap_lastmod" TIMESTAMP,
        "image_url" text,
        "image_title" text,
        "discovered_at" TIMESTAMP NOT NULL DEFAULT NOW(),
        "last_validated_at" TIMESTAMP,
        "is_invalid" BOOLEAN NOT NULL DEFAULT false,
        "last_extracted_at" TIMESTAMP,
        "extraction_status" character varying(20) NOT NULL DEFAULT 'pending',
        "extraction_error" text,
        "variants_total" integer,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_product_urls" PRIMARY KEY ("id"),
        CONSTRAINT "FK_product_urls_store" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_product_urls_collection" FOREIGN KEY ("mtg_singles_collection_id") REFERENCES "mtg_singles_collections"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`CREATE UNIQUE INDEX "idx_product_urls_store_handle" ON "product_urls" ("store_id", "handle")`);
    await queryRunner.query(`CREATE INDEX "idx_product_urls_store_status" ON "product_urls" ("store_id", "extraction_status")`);
    await queryRunner.query(`CREATE INDEX "idx_product_urls_extraction" ON "product_urls" ("extraction_status", "last_extracted_at")`);
    await queryRunner.query(`CREATE INDEX "idx_product_urls_collection" ON "product_urls" ("mtg_singles_collection_id")`);

    // ============== card_listings ==============
    await queryRunner.query(`
      CREATE TABLE "card_listings" (
        "id" BIGSERIAL NOT NULL,
        "card_name_id" integer,
        "card_printing_id" integer,
        "store_id" integer NOT NULL,
        "product_url_id" bigint NOT NULL,
        "title" character varying(500) NOT NULL,
        "raw_title" character varying(500),
        "set_name" character varying(255),
        "set_code" character varying(10),
        "collector_number" character varying(10),
        "condition" character varying(20) NOT NULL,
        "foil" boolean NOT NULL DEFAULT false,
        "price" numeric(10,2) NOT NULL,
        "currency" character varying(3) NOT NULL DEFAULT 'CAD',
        "in_stock" boolean NOT NULL DEFAULT true,
        "quantity" integer,
        "image_url" text,
        "product_link" text NOT NULL,
        "sku" character varying(100),
        "platform_variant_id" character varying(100),
        "price_updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_card_listings" PRIMARY KEY ("id"),
        CONSTRAINT "FK_card_listings_card_name" FOREIGN KEY ("card_name_id") REFERENCES "card_names"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_card_listings_card_printing" FOREIGN KEY ("card_printing_id") REFERENCES "card_printings"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_card_listings_store" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_card_listings_product_url" FOREIGN KEY ("product_url_id") REFERENCES "product_urls"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_card_listings_card_name_id" ON "card_listings" ("card_name_id")`);
    await queryRunner.query(`CREATE INDEX "idx_card_listings_store_card" ON "card_listings" ("store_id", "card_name_id")`);
    await queryRunner.query(`CREATE INDEX "idx_card_listings_price" ON "card_listings" ("card_name_id", "price")`);
    await queryRunner.query(`CREATE INDEX "idx_card_listings_updated" ON "card_listings" ("price_updated_at")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "idx_card_listings_store_platform_variant" ON "card_listings" ("store_id", "platform_variant_id")`);
    await queryRunner.query(`CREATE INDEX "idx_card_listings_printing_id" ON "card_listings" ("card_printing_id")`);

    // Partial indexes for fast in-stock queries
    await queryRunner.query(`CREATE INDEX "idx_card_listings_in_stock_card_name_price" ON "card_listings" ("card_name_id", "price") WHERE "in_stock" = true`);
    await queryRunner.query(`CREATE INDEX "idx_card_listings_in_stock_store_card_name" ON "card_listings" ("store_id", "card_name_id") WHERE "in_stock" = true`);
    await queryRunner.query(`CREATE INDEX "idx_card_listings_in_stock_printing_price" ON "card_listings" ("card_printing_id", "price") WHERE "in_stock" = true`);

    // ============== unmatched_cards ==============
    await queryRunner.query(`
      CREATE TABLE "unmatched_cards" (
        "id" BIGSERIAL NOT NULL,
        "store_id" integer NOT NULL,
        "product_url_id" bigint NOT NULL,
        "raw_name" character varying(500) NOT NULL,
        "normalized_name" character varying(500) NOT NULL,
        "set_name" character varying(255),
        "set_code" character varying(10),
        "collector_number" character varying(10),
        "condition" character varying(20) NOT NULL,
        "foil" boolean NOT NULL DEFAULT false,
        "price" numeric(10,2) NOT NULL,
        "currency" character varying(3) NOT NULL DEFAULT 'CAD',
        "in_stock" boolean NOT NULL DEFAULT true,
        "quantity" integer,
        "image_url" text,
        "product_link" text NOT NULL,
        "sku" character varying(100),
        "platform_variant_id" character varying(100),
        "retry_count" integer NOT NULL DEFAULT 0,
        "last_retry_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_unmatched_cards" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_unmatched_cards_store_product_raw" UNIQUE ("store_id", "product_url_id", "raw_name"),
        CONSTRAINT "FK_unmatched_cards_store" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_unmatched_cards_product_url" FOREIGN KEY ("product_url_id") REFERENCES "product_urls"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_unmatched_cards_normalized_name" ON "unmatched_cards" ("normalized_name")`);
    await queryRunner.query(`CREATE INDEX "idx_unmatched_cards_created_at" ON "unmatched_cards" ("created_at")`);

    // ============== card_price_history ==============
    await queryRunner.query(`
      CREATE TABLE "card_price_history" (
        "id" BIGSERIAL NOT NULL,
        "card_listing_id" bigint NOT NULL,
        "card_printing_id" integer,
        "store_id" integer NOT NULL,
        "price" numeric(10,2) NOT NULL,
        "condition" character varying(20) NOT NULL,
        "foil" boolean NOT NULL DEFAULT false,
        "in_stock" boolean,
        "recorded_at" TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_card_price_history" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_price_history_listing_date" ON "card_price_history" ("card_listing_id", "recorded_at" DESC)`);
    await queryRunner.query(`CREATE INDEX "idx_price_history_printing_date" ON "card_price_history" ("card_printing_id", "recorded_at" DESC)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "card_price_history"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "unmatched_cards"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "card_listings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "product_urls"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "card_printings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sets"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "card_names"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "mtg_singles_collections"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "stores"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "platforms"`);
  }
}
