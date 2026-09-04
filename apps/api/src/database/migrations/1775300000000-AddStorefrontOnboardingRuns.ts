import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStorefrontOnboardingRuns1775300000000 implements MigrationInterface {
  name = 'AddStorefrontOnboardingRuns1775300000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "storefront_onboarding_runs" (
      "id" SERIAL NOT NULL, "requested_url" character varying NOT NULL,
      "requested_slug" character varying, "status" character varying NOT NULL,
      "report" jsonb, "proposal" jsonb, "digest" character varying,
      "approved_store_id" integer, "approved_by_user_uuid" character varying,
      "approved_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_storefront_onboarding_runs" PRIMARY KEY ("id")
    )`);
    await queryRunner.query('CREATE INDEX "IDX_storefront_onboarding_runs_status" ON "storefront_onboarding_runs" ("status")');
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "storefront_onboarding_runs"');
  }
}
