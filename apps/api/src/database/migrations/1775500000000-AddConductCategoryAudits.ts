import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddConductCategoryAudits1775500000000 implements MigrationInterface {
  name = 'AddConductCategoryAudits1775500000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS conduct_category_audits (
      id serial PRIMARY KEY, store_id integer NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      extraction_run_id integer NULL, category_id integer NULL, category_name varchar(500) NOT NULL,
      visible boolean NOT NULL DEFAULT true, listing_count integer NOT NULL, variant_count integer NOT NULL,
      completed_at timestamp NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_conduct_category_audits_store_category_completed ON conduct_category_audits(store_id, category_id, completed_at DESC)`);
  }
  async down(queryRunner: QueryRunner): Promise<void> { await queryRunner.query('DROP TABLE IF EXISTS conduct_category_audits'); }
}
