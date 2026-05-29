import { MigrationInterface, QueryRunner } from 'typeorm';

export class CardListsPrincipalOwnership1774300000000
  implements MigrationInterface
{
  name = 'CardListsPrincipalOwnership1774300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_card_lists_owner_cookie"`,
    );
    await queryRunner.query(
      `ALTER TABLE "card_lists" RENAME COLUMN "owner_cookie" TO "owner_principal_uuid"`,
    );
    await queryRunner.query(
      `ALTER TABLE "card_lists" ADD COLUMN "visibility" varchar(16) NOT NULL DEFAULT 'unlisted'`,
    );
    await queryRunner.query(
      `ALTER TABLE "card_lists" ADD CONSTRAINT "CHK_card_lists_visibility" CHECK ("visibility" IN ('private', 'unlisted', 'public'))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_card_lists_owner_principal_uuid" ON "card_lists" ("owner_principal_uuid")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_card_lists_owner_principal_uuid"`,
    );
    await queryRunner.query(
      `ALTER TABLE "card_lists" DROP CONSTRAINT IF EXISTS "CHK_card_lists_visibility"`,
    );
    await queryRunner.query(
      `ALTER TABLE "card_lists" DROP COLUMN "visibility"`,
    );
    await queryRunner.query(
      `ALTER TABLE "card_lists" RENAME COLUMN "owner_principal_uuid" TO "owner_cookie"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_card_lists_owner_cookie" ON "card_lists" ("owner_cookie")`,
    );
  }
}
