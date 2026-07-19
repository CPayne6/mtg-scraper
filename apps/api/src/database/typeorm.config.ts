import { DataSource } from 'typeorm';
import { existsSync, readFileSync } from 'fs';
import {
  Store,
  CardName,
  ProductUrl,
  ScryfallSet,
  CardPrinting,
  CardListing,
  CardCondition,
  CardVariant,
  UnmatchedCard,
  TokenName,
  TokenPrinting,
  TokenListing,
  TokenVariant,
  ExtractionRun,
  CardCart,
  CardList,
  CardListEntry,
} from '@scoutlgs/core';

// TypeORM CLI configuration for migrations
// In development: uses ts-node with .ts files (migration:run)
// In production: uses compiled .js files from dist/ (migration:run:prod)
const isProduction = process.env.NODE_ENV === 'production';
const databasePasswordFile = process.env.DATABASE_PASSWORD_FILE;
const databasePassword =
  databasePasswordFile && existsSync(databasePasswordFile)
    ? readFileSync(databasePasswordFile, 'utf8').trim()
    : process.env.DATABASE_PASSWORD || 'postgres';

export default new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  username: process.env.DATABASE_USER || 'postgres',
  password: databasePassword,
  database: process.env.DATABASE_NAME || 'scoutlgs',
  entities: [
    Store,
    CardName,
    ProductUrl,
    ScryfallSet,
    CardPrinting,
    CardListing,
    CardCondition,
    CardVariant,
    UnmatchedCard,
    TokenName,
    TokenPrinting,
    TokenListing,
    TokenVariant,
    ExtractionRun,
    CardCart,
    CardList,
    CardListEntry,
  ],
  migrations: isProduction
    ? ['dist/database/migrations/*.js']
    : ['src/database/migrations/*.ts'],
});
