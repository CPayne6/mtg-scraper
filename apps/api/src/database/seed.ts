import { DataSource } from 'typeorm';
import { Store, CardCondition } from '@scoutlgs/core';

// Storefront API extraction is per-store: each store gets a Shopify search
// query that scopes the catalog to MTG singles. The extraction cron in the
// scheduler enqueues a `storefront-extraction` job for every active store
// where `discoveryConfig.discoveryEnabled === true`.
//
// `scraperType` is a legacy column that's still NOT NULL on the schema —
// we keep it set so upserts don't fail. The new pipeline doesn't read it.
const stores: Partial<Store>[] = [
  {
    name: 'face-to-face-games',
    displayName: 'Face to Face Games',
    baseUrl: 'https://facetofacegames.com',
    scraperType: 'f2f' as const,
    platformType: 'shopify_storefront',
    rateLimitPerSecond: 12,
    isActive: true,
    scraperConfig: {
      storefrontScope: 'product_type:Singles vendor:Magic',
    },
    discoveryConfig: { discoveryEnabled: true },
  },
  {
    name: '401-games',
    displayName: '401 Games',
    baseUrl: 'https://store.401games.ca',
    scraperType: '401' as const,
    platformType: 'shopify_storefront',
    rateLimitPerSecond: 25,
    isActive: true,
    scraperConfig: {
      storefrontScope: 'product_type:"Magic: The Gathering Singles"',
    },
    discoveryConfig: { discoveryEnabled: true },
  },
  {
    name: 'hobbiesville',
    displayName: 'Hobbiesville',
    baseUrl: 'https://hobbiesville.com',
    scraperType: 'hobbies' as const,
    platformType: 'shopify_storefront',
    rateLimitPerSecond: 15,
    isActive: true,
    scraperConfig: {
      storefrontScope: 'product_type:Single tag:Brands_Magicthegathering',
    },
    discoveryConfig: { discoveryEnabled: true },
  },
  {
    name: 'house-of-cards',
    displayName: 'House of Cards',
    baseUrl: 'https://houseofcards.ca',
    scraperType: 'binderpos' as const,
    platformType: 'shopify_storefront',
    rateLimitPerSecond: 20,
    isActive: true,
    scraperConfig: {
      shopifyUrl: 'house-of-cards-mtg.myshopify.com',
      storefrontScope: 'product_type:"MTG Single"',
    },
    discoveryConfig: { discoveryEnabled: true },
  },
  {
    name: 'black-knight-games',
    displayName: 'Black Knight Games',
    baseUrl: 'https://blackknightgames.ca',
    scraperType: 'binderpos' as const,
    platformType: 'shopify_storefront',
    rateLimitPerSecond: 20,
    isActive: true,
    scraperConfig: {
      shopifyUrl: 'black-knight-games.myshopify.com',
      storefrontScope: 'product_type:"MTG Single"',
    },
    discoveryConfig: { discoveryEnabled: true },
  },
  {
    name: 'exor-games',
    displayName: 'Exor Games',
    baseUrl: 'https://exorgames.com',
    scraperType: 'binderpos' as const,
    platformType: 'shopify_storefront',
    rateLimitPerSecond: 20,
    isActive: true,
    scraperConfig: {
      shopifyUrl: 'most-wanted-ca.myshopify.com',
      storefrontScope: 'product_type:"MTG Single"',
    },
    discoveryConfig: { discoveryEnabled: true },
  },
  {
    name: 'game-knight',
    displayName: 'Game Knight',
    baseUrl: 'https://gameknight.ca',
    scraperType: 'binderpos' as const,
    platformType: 'shopify_storefront',
    rateLimitPerSecond: 20,
    isActive: true,
    scraperConfig: {
      shopifyUrl: 'gameknight-games.myshopify.com',
      storefrontScope: 'product_type:"MTG Single"',
    },
    discoveryConfig: { discoveryEnabled: true },
  },
  {
    name: 'the-cg-realm',
    displayName: 'The CG Realm',
    baseUrl: 'https://www.thecgrealm.com',
    scraperType: 'cgrealm' as const,
    platformType: 'shopify_storefront',
    rateLimitPerSecond: 15,
    isActive: true,
    scraperConfig: {
      shopifyUrl: 'the-cg-realm.myshopify.com',
      storefrontScope: 'product_type:"MTG Single"',
    },
    discoveryConfig: { discoveryEnabled: true },
  },
];

const cardConditions: Partial<CardCondition>[] = [
  { code: 'nm', displayName: 'Near Mint', sortOrder: 1 },
  { code: 'lp', displayName: 'Lightly Played', sortOrder: 2 },
  { code: 'mp', displayName: 'Moderately Played', sortOrder: 3 },
  { code: 'hp', displayName: 'Heavily Played', sortOrder: 4 },
  { code: 'dmg', displayName: 'Damaged', sortOrder: 5 },
  { code: 'unknown', displayName: 'Unknown', sortOrder: 6 },
];

async function seed() {
  const AppDataSource = new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432'),
    username: process.env.DATABASE_USER || 'postgres',
    password: process.env.DATABASE_PASSWORD || 'postgres',
    database: process.env.DATABASE_NAME || 'scoutlgs',
    entities: [Store, CardCondition],
    synchronize: false,
  });

  try {
    await AppDataSource.initialize();
    console.log('Data Source has been initialized!');

    const storeRepository = AppDataSource.getRepository(Store);
    const conditionRepository = AppDataSource.getRepository(CardCondition);

    await conditionRepository.upsert(cardConditions, {
      conflictPaths: ['code'],
      skipUpdateIfNoValuesChanged: true,
    });
    console.log(`Upserted ${cardConditions.length} card conditions!`);

    await storeRepository.upsert(stores, {
      conflictPaths: ['name'],
      skipUpdateIfNoValuesChanged: true,
    });
    console.log(`Upserted ${stores.length} stores successfully!`);

    await AppDataSource.destroy();
  } catch (error) {
    console.error('Error during seeding:', error);
    process.exit(1);
  }
}

seed();
