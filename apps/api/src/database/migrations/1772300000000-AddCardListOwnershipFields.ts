import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCardListOwnershipFields1772300000000 implements MigrationInterface {
  name = 'AddCardListOwnershipFields1772300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "card_lists"
        ADD "owner_user_uuid" uuid,
        ADD "visibility" varchar(20) NOT NULL DEFAULT 'private',
        ADD "public_share_enabled" boolean NOT NULL DEFAULT false,
        ADD "public_share_token_hash" text,
        ADD "public_share_expires_at" TIMESTAMP,
        ADD "claimed_at" TIMESTAMP
    `);

    await queryRunner.query(`
      ALTER TABLE "card_lists"
        ADD CONSTRAINT "CHK_card_lists_visibility"
        CHECK ("visibility" IN ('private', 'unlisted', 'public'))
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_card_lists_owner_user_uuid" ON "card_lists" ("owner_user_uuid")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_card_lists_visibility" ON "card_lists" ("visibility")`,
    );
    await queryRunner.query(`
      CREATE INDEX "IDX_card_lists_public_share_token_hash"
      ON "card_lists" ("public_share_token_hash")
      WHERE "public_share_token_hash" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_card_lists_public_share_token_hash"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_card_lists_visibility"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_card_lists_owner_user_uuid"`,
    );
    await queryRunner.query(
      `ALTER TABLE "card_lists" DROP CONSTRAINT IF EXISTS "CHK_card_lists_visibility"`,
    );
    await queryRunner.query(`
      ALTER TABLE "card_lists"
        DROP COLUMN "claimed_at",
        DROP COLUMN "public_share_expires_at",
        DROP COLUMN "public_share_token_hash",
        DROP COLUMN "public_share_enabled",
        DROP COLUMN "visibility",
        DROP COLUMN "owner_user_uuid"
    `);
  }
}
