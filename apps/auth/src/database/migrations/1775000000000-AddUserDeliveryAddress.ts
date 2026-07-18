import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserDeliveryAddress1775000000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "delivery_address" jsonb');
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "users" DROP COLUMN IF EXISTS "delivery_address"');
  }
}
