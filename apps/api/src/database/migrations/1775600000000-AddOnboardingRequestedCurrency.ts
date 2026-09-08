import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOnboardingRequestedCurrency1775600000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE storefront_onboarding_runs ADD COLUMN requested_currency varchar NULL');
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE storefront_onboarding_runs DROP COLUMN requested_currency');
  }
}
