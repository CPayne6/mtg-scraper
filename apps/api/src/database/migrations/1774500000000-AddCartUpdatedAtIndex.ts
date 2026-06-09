import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCartUpdatedAtIndex1774500000000 implements MigrationInterface {
  name = 'AddCartUpdatedAtIndex1774500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "idx_card_carts_updated_at" ON "card_carts" ("updated_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_card_carts_updated_at"`);
  }
}
