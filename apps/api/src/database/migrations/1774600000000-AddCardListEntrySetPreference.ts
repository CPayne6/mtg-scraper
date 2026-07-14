import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCardListEntrySetPreference1774600000000 implements MigrationInterface {
  name = 'AddCardListEntrySetPreference1774600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.card_list_entries
      ADD COLUMN preferred_set_code character varying(10)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_card_list_entries_preferred_set_code
      ON public.card_list_entries USING btree (preferred_set_code)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS public.idx_card_list_entries_preferred_set_code
    `);
    await queryRunner.query(`
      ALTER TABLE public.card_list_entries
      DROP COLUMN IF EXISTS preferred_set_code
    `);
  }
}
