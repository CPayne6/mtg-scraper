import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add match-confidence columns to card_listings so we can retroactively
 * filter low-confidence matches for review.
 *
 * Three dimensions, all written by the matcher:
 *   - name_match:    how the card_name was resolved
 *   - set_match:     how the set was resolved from extractor input
 *   - printing_match: how the printing was selected once the card was known
 *
 * Existing rows are backfilled as 'unknown' since we never captured this
 * before — they'll be re-populated on the next extraction.
 */
export class AddMatchConfidenceToListings1774100000000
  implements MigrationInterface
{
  name = 'AddMatchConfidenceToListings1774100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE card_listings
        ADD COLUMN name_match varchar(20) NOT NULL DEFAULT 'unknown',
        ADD COLUMN set_match varchar(20) NOT NULL DEFAULT 'unknown',
        ADD COLUMN printing_match varchar(20) NOT NULL DEFAULT 'unknown'
    `);

    // Indexes for filtering — composite covers the common case of finding
    // suspect rows (e.g. fuzzy name + any printing) without scanning the table.
    await queryRunner.query(`
      CREATE INDEX idx_card_listings_match_confidence
        ON card_listings (name_match, printing_match, set_match)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_card_listings_match_confidence`);
    await queryRunner.query(`
      ALTER TABLE card_listings
        DROP COLUMN IF EXISTS name_match,
        DROP COLUMN IF EXISTS set_match,
        DROP COLUMN IF EXISTS printing_match
    `);
  }
}
