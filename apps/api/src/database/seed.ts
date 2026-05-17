import { DataSource } from 'typeorm';
import { Store, Platform, MtgSinglesCollection, CardCondition } from '@scoutlgs/core';

// Storefront API extraction is per-store: each store gets a Shopify search
// query that scopes the catalog to MTG singles. The discovery cron in the
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
  },
];

// Collections are legacy cruft: product_urls.mtg_singles_collection_id is
// still NOT NULL with an FK to mtg_singles_collections, even though the new
// Storefront API pipeline scopes queries via scraperConfig.storefrontScope
// instead. Until that column is dropped via migration, every store needs a
// non-null collection id, so we seed a placeholder row per scope and link
// stores to it.
const mtgSinglesCollections: Partial<MtgSinglesCollection>[] = [
  { slug: 'magic-the-gathering-singles', displayName: 'MTG Singles' },
  { slug: 'mtg-singles-all-products', displayName: 'MTG Singles - All Products' },
  { slug: 'magic-singles', displayName: 'Magic Singles' },
];

const cardConditions: Partial<CardCondition>[] = [
  { code: 'nm', displayName: 'Near Mint', sortOrder: 1 },
  { code: 'lp', displayName: 'Lightly Played', sortOrder: 2 },
  { code: 'mp', displayName: 'Moderately Played', sortOrder: 3 },
  { code: 'hp', displayName: 'Heavily Played', sortOrder: 4 },
  { code: 'dmg', displayName: 'Damaged', sortOrder: 5 },
  { code: 'unknown', displayName: 'Unknown', sortOrder: 6 },
];

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
    synchronize: false,
  });

  try {
    await AppDataSource.initialize();
    console.log('Data Source has been initialized!');

    const storeRepository = AppDataSource.getRepository(Store);
    const collectionRepository = AppDataSource.getRepository(MtgSinglesCollection);
    const conditionRepository = AppDataSource.getRepository(CardCondition);

    await conditionRepository.upsert(cardConditions, {
      conflictPaths: ['code'],
      skipUpdateIfNoValuesChanged: true,
    });
    console.log(`Upserted ${cardConditions.length} card conditions!`);

    await collectionRepository.upsert(mtgSinglesCollections, {
      conflictPaths: ['slug'],
      skipUpdateIfNoValuesChanged: true,
    });
    console.log(`Upserted ${mtgSinglesCollections.length} MTG singles collections!`);

    const collections = await collectionRepository.find();
    const collectionBySlug = new Map(collections.map((c) => [c.slug, c]));

    await storeRepository.upsert(stores, {
      conflictPaths: ['name'],
      skipUpdateIfNoValuesChanged: true,
    });
    console.log(`Upserted ${stores.length} stores successfully!`);

    // Set discoveryConfig per store. Done as a separate UPDATE so we can
    // include the collection id that wasn't available at upsert time.
    for (const store of stores) {
      const collectionSlug = storeCollectionMap[store.name!];
      const collection = collectionSlug ? collectionBySlug.get(collectionSlug) : undefined;
      if (!collection) continue;

      await storeRepository.update(
        { name: store.name },
        {
          discoveryConfig: {
            mtgSinglesCollectionId: collection.id,
            discoveryEnabled: true,
          },
        },
      );
    }
    console.log('Set discoveryConfig (discoveryEnabled=true) on all stores');

    await AppDataSource.destroy();
  } catch (error) {
    console.error('Error during seeding:', error);
    process.exit(1);
  }
}

seed();
