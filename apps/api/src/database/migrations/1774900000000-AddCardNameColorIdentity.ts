import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCardNameColorIdentity1774900000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> { await queryRunner.query('ALTER TABLE card_names ADD COLUMN IF NOT EXISTS color_identity varchar(5) NULL'); }
  async down(queryRunner: QueryRunner): Promise<void> { await queryRunner.query('ALTER TABLE card_names DROP COLUMN color_identity'); }
}
