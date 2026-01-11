import { DataSource } from 'typeorm';
import { Store } from '@scoutlgs/core';

// TypeORM CLI configuration for migrations
// In development: uses ts-node with .ts files (migration:run)
// In production: uses compiled .js files from dist/ (migration:run:prod)
const isProduction = process.env.NODE_ENV === 'production';

export default new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  username: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
  database: process.env.DATABASE_NAME || 'scoutlgs',
  entities: [Store],
  migrations: isProduction
    ? ['dist/database/migrations/*.js']
    : ['src/database/migrations/*.ts'],
});
