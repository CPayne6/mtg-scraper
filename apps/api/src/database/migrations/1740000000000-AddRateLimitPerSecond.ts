import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRateLimitPerSecond1740000000000 implements MigrationInterface {
  name = 'AddRateLimitPerSecond1740000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "stores" ADD COLUMN "rate_limit_per_second" integer NOT NULL DEFAULT 15`,
    );

    // Set per-store rates based on tested sustainable values
    await queryRunner.query(
      `UPDATE "stores" SET "rate_limit_per_second" = 25 WHERE "name" = '401-games'`,
    );
    await queryRunner.query(
      `UPDATE "stores" SET "rate_limit_per_second" = 20 WHERE "name" IN ('game-knight', 'exor-games', 'house-of-cards', 'black-knight-games')`,
    );
    await queryRunner.query(
      `UPDATE "stores" SET "rate_limit_per_second" = 15 WHERE "name" IN ('hobbiesville', 'the-cg-realm')`,
    );
    await queryRunner.query(
      `UPDATE "stores" SET "rate_limit_per_second" = 12 WHERE "name" = 'face-to-face-games'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "stores" DROP COLUMN "rate_limit_per_second"`,
    );
  }
}
