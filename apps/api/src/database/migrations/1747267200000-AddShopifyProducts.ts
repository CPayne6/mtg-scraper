import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddShopifyProducts1747267200000 implements MigrationInterface {
  name = 'AddShopifyProducts1747267200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "shopify_products" (
        "shopify_product_id" bigint NOT NULL,
        "store_id" integer NOT NULL,
        "product_url_id" integer,
        "card_listing_id" integer,
        "is_token" boolean NOT NULL DEFAULT false,
        "match_status" varchar(20) NOT NULL DEFAULT 'pending',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_shopify_products" PRIMARY KEY ("shopify_product_id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "shopify_products"
        ADD CONSTRAINT "FK_shopify_products_store"
        FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "shopify_products"
        ADD CONSTRAINT "FK_shopify_products_product_url"
        FOREIGN KEY ("product_url_id") REFERENCES "product_urls"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "shopify_products"
        ADD CONSTRAINT "FK_shopify_products_card_listing"
        FOREIGN KEY ("card_listing_id") REFERENCES "card_listings"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_shopify_products_store" ON "shopify_products" ("store_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_shopify_products_product_url" ON "shopify_products" ("product_url_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_shopify_products_match_status" ON "shopify_products" ("match_status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "shopify_products"`);
  }
}
