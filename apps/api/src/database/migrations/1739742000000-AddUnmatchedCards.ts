import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUnmatchedCards1739742000000 implements MigrationInterface {
  name = 'AddUnmatchedCards1739742000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // trgm index on card_names.normalized_name (complements existing name trgm index)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_card_names_normalized_name_trgm" ON "card_names" USING gin ("normalized_name" gin_trgm_ops)`);

    // unmatched_cards table
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "unmatched_cards"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_card_names_normalized_name_trgm"`);
  }
}
