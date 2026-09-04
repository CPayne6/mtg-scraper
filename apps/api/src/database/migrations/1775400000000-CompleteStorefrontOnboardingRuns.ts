import { MigrationInterface, QueryRunner } from 'typeorm';

export class CompleteStorefrontOnboardingRuns1775400000000 implements MigrationInterface {
  name = 'CompleteStorefrontOnboardingRuns1775400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "storefront_onboarding_runs" ADD COLUMN IF NOT EXISTS "requested_scope" character varying');
    await queryRunner.query('ALTER TABLE "storefront_onboarding_runs" ADD COLUMN IF NOT EXISTS "parser_profile" jsonb');
    await queryRunner.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_storefront_onboarding_run_approved_store') THEN
        ALTER TABLE "storefront_onboarding_runs" ADD CONSTRAINT "FK_storefront_onboarding_run_approved_store"
        FOREIGN KEY ("approved_store_id") REFERENCES "stores"("id") ON DELETE SET NULL;
      END IF;
    END $$`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "storefront_onboarding_runs" DROP CONSTRAINT IF EXISTS "FK_storefront_onboarding_run_approved_store"');
    await queryRunner.query('ALTER TABLE "storefront_onboarding_runs" DROP COLUMN IF EXISTS "parser_profile"');
    await queryRunner.query('ALTER TABLE "storefront_onboarding_runs" DROP COLUMN IF EXISTS "requested_scope"');
  }
}
