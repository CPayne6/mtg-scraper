import { MigrationInterface, QueryRunner } from 'typeorm';

const stores: Array<[string, string]> = [
  ['Face to Face Games', 'f2f'], ['401 Games', '401'], ['Hobbiesville', 'hobbies'],
  ['House of Cards', 'binderpos'], ['Black Knight Games', 'binderpos'],
  ['Exor Games', 'binderpos'], ['Game Knight', 'binderpos'], ['The CG Realm', 'cgrealm'],
];

export class AddStorefrontParserProfiles1775200000000 implements MigrationInterface {
  name = 'AddStorefrontParserProfiles1775200000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    for (const [displayName, parserType] of stores) {
      await queryRunner.query(
        `UPDATE stores SET scraper_config = jsonb_set(COALESCE(scraper_config, '{}'::jsonb), '{parser}', $1::jsonb, true)
         WHERE display_name = $2 AND NOT (COALESCE(scraper_config, '{}'::jsonb) ? 'parser')`,
        [JSON.stringify({ kind: 'builtin', version: 1, parserType }), displayName],
      );
    }
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE stores SET scraper_config = COALESCE(scraper_config, '{}'::jsonb) - 'parser'
       WHERE display_name = ANY($1) AND scraper_config->'parser'->>'kind' = 'builtin'
         AND scraper_config->'parser'->>'version' = '1'
         AND scraper_config->'parser'->>'parserType' = scraper_type`,
      [stores.map(([name]) => name)],
    );
  }
}
