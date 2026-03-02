import { DataSource } from 'typeorm';
import { Store, Platform, MtgSinglesCollection, CardCondition } from '@scoutlgs/core';

const stores: Partial<Store>[] = [
  {
    name: 'face-to-face-games',
    displayName: 'Face to Face Games',
    baseUrl: 'https://facetofacegames.com',
    scraperType: 'f2f' as const,
    platformType: 'shopify',
    rateLimitPerSecond: 12,
    isActive: true,
  },
  {
    name: '401-games',
    displayName: '401 Games',
    baseUrl: 'https://store.401games.ca',
    scraperType: '401' as const,
    platformType: 'shopify',
    rateLimitPerSecond: 25,
    isActive: true,
  },
  {
    name: 'hobbiesville',
    displayName: 'Hobbiesville',
    baseUrl: 'https://hobbiesville.com',
    scraperType: 'hobbies' as const,
    platformType: 'shopify',
    rateLimitPerSecond: 15,
    isActive: true,
  },
  {
    name: 'house-of-cards',
    displayName: 'House of Cards',
    baseUrl: 'https://houseofcards.ca',
    scraperType: 'binderpos' as const,
    platformType: 'shopify',
    rateLimitPerSecond: 20,
    scraperConfig: {
      searchPath: 'mtg-advanced-search',
      shopifyUrl: 'house-of-cards-mtg.myshopify.com',
    },
    isActive: true,
  },
  {
    name: 'black-knight-games',
    displayName: 'Black Knight Games',
    baseUrl: 'https://blackknightgames.ca',
    scraperType: 'binderpos' as const,
    platformType: 'shopify',
    rateLimitPerSecond: 20,
    scraperConfig: {
      searchPath: 'magic-the-gathering-search',
      shopifyUrl: 'black-knight-games.myshopify.com',
    },
    isActive: true,
  },
  {
    name: 'exor-games',
    displayName: 'Exor Games',
    baseUrl: 'https://exorgames.com',
    scraperType: 'binderpos' as const,
    platformType: 'shopify',
    rateLimitPerSecond: 20,
    scraperConfig: {
      searchPath: 'advanced-search',
      shopifyUrl: 'most-wanted-ca.myshopify.com',
    },
    isActive: true,
  },
  {
    name: 'game-knight',
    displayName: 'Game Knight',
    baseUrl: 'https://gameknight.ca',
    scraperType: 'binderpos' as const,
    platformType: 'shopify',
    rateLimitPerSecond: 20,
    scraperConfig: {
      searchPath: 'magic-the-gathering-singles',
      shopifyUrl: 'gameknight-games.myshopify.com',
    },
    isActive: true,
  },
  {
    name: 'the-cg-realm',
    displayName: 'The CG Realm',
    baseUrl: 'https://www.thecgrealm.com',
    scraperType: 'binderpos' as const,
    platformType: 'shopify',
    rateLimitPerSecond: 15,
    scraperConfig: {
      searchPath: 'search',
      shopifyUrl: 'the-cg-realm.myshopify.com',
    },
    isActive: true,
  },
];

// MTG Singles collection slugs — verified via Shopify collections.json
// face-to-face-games, 401-games, exor-games → magic-the-gathering-singles (107K-158K products)
// house-of-cards, black-knight-games, game-knight, the-cg-realm → mtg-singles-all-products (~107K products)
// hobbiesville → magic-singles (6K products)
const mtgSinglesCollections: Partial<MtgSinglesCollection>[] = [
  { slug: 'magic-the-gathering-singles', displayName: 'MTG Singles' },
  { slug: 'mtg-singles-all-products', displayName: 'MTG Singles - All Products' },
  { slug: 'magic-singles', displayName: 'Magic Singles' },
];

// Card conditions for the card_variants lookup table
const cardConditions: Partial<CardCondition>[] = [
  { code: 'nm', displayName: 'Near Mint', sortOrder: 1 },
  { code: 'lp', displayName: 'Lightly Played', sortOrder: 2 },
  { code: 'mp', displayName: 'Moderately Played', sortOrder: 3 },
  { code: 'hp', displayName: 'Heavily Played', sortOrder: 4 },
  { code: 'dmg', displayName: 'Damaged', sortOrder: 5 },
  { code: 'unknown', displayName: 'Unknown', sortOrder: 6 },
];

// Map store name → collection slug for discovery config
const storeCollectionMap: Record<string, string> = {
  'face-to-face-games': 'magic-the-gathering-singles',
  '401-games': 'magic-the-gathering-singles',
  'hobbiesville': 'magic-singles',
  'house-of-cards': 'mtg-singles-all-products',
  'black-knight-games': 'mtg-singles-all-products',
  'exor-games': 'magic-the-gathering-singles',
  'game-knight': 'mtg-singles-all-products',
  'the-cg-realm': 'mtg-singles-all-products',
};

async function seed() {
  const AppDataSource = new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432'),
    username: process.env.DATABASE_USER || 'postgres',
    password: process.env.DATABASE_PASSWORD || 'postgres',
    database: process.env.DATABASE_NAME || 'scoutlgs',
    entities: [Store, Platform, MtgSinglesCollection, CardCondition],
    synchronize: false, // Don't sync - use migrations
  });

  try {
    await AppDataSource.initialize();
    console.log('Data Source has been initialized!');

    const storeRepository = AppDataSource.getRepository(Store);
    const collectionRepository = AppDataSource.getRepository(MtgSinglesCollection);
    const conditionRepository = AppDataSource.getRepository(CardCondition);

    // Seed card conditions
    await conditionRepository.upsert(cardConditions, {
      conflictPaths: ['code'],
      skipUpdateIfNoValuesChanged: true,
    });
    console.log(`Upserted ${cardConditions.length} card conditions!`);

    // Seed MTG singles collections
    await collectionRepository.upsert(mtgSinglesCollections, {
      conflictPaths: ['slug'],
      skipUpdateIfNoValuesChanged: true,
    });
    console.log(`Upserted ${mtgSinglesCollections.length} MTG singles collections!`);

    // Look up collection IDs by slug
    const collections = await collectionRepository.find();
    const collectionBySlug = new Map(
      collections.map((c) => [c.slug, c]),
    );

    // Use upsert to insert or update stores
    await storeRepository.upsert(stores, {
      conflictPaths: ['name'], // Use 'name' as the unique constraint
      skipUpdateIfNoValuesChanged: true,
    });
    console.log(`Upserted ${stores.length} stores successfully!`);

    // Link each store to its MTG singles collection via discoveryConfig
    for (const store of stores) {
      const collectionSlug = storeCollectionMap[store.name!];
      const collection = collectionSlug ? collectionBySlug.get(collectionSlug) : undefined;

      if (collection) {
        await storeRepository.update(
          { name: store.name },
          {
            discoveryConfig: {
              mtgSinglesCollectionId: collection.id,
              discoveryEnabled: false,
            },
          },
        );
      }
    }
    console.log('Linked stores to MTG singles collections!');

    await AppDataSource.destroy();
  } catch (error) {
    console.error('Error during seeding:', error);
    process.exit(1);
  }
}

seed();
