import { DataSource } from 'typeorm';
import { Store } from '@scoutlgs/core';

const stores: Partial<Store>[] = [
  {
    name: 'face-to-face-games',
    displayName: 'Face to Face Games',
    baseUrl: 'https://www.facetofacegames.com',
    scraperType: 'f2f' as const,
    isActive: true,
  },
  {
    name: '401-games',
    displayName: '401 Games',
    baseUrl: 'https://store.401games.ca',
    scraperType: '401' as const,
    isActive: true,
  },
  {
    name: 'hobbiesville',
    displayName: 'Hobbiesville',
    baseUrl: 'https://www.hobbiesville.ca',
    scraperType: 'hobbies' as const,
    isActive: true,
  },
  {
    name: 'house-of-cards',
    displayName: 'House of Cards',
    baseUrl: 'https://houseofcards.ca',
    scraperType: 'binderpos' as const,
    scraperConfig: { searchPath: 'mtg-advanced-search' },
    isActive: true,
  },
  {
    name: 'black-knight-games',
    displayName: 'Black Knight Games',
    baseUrl: 'https://blackknightgames.ca',
    scraperType: 'binderpos' as const,
    scraperConfig: { searchPath: 'magic-the-gathering-search' },
    isActive: true,
  },
  {
    name: 'exor-games',
    displayName: 'Exor Games',
    baseUrl: 'https://exorgames.com',
    scraperType: 'binderpos' as const,
    scraperConfig: { searchPath: 'advanced-search' },
    isActive: true,
  },
  {
    name: 'game-knight',
    displayName: 'Game Knight',
    baseUrl: 'https://gameknight.ca',
    scraperType: 'binderpos' as const,
    scraperConfig: { searchPath: 'magic-the-gathering-singles' },
    isActive: true,
  },
];

async function seed() {
  const AppDataSource = new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432'),
    username: process.env.DATABASE_USER || 'postgres',
    password: process.env.DATABASE_PASSWORD || 'postgres',
    database: process.env.DATABASE_NAME || 'scoutlgs',
    entities: [Store],
    synchronize: true, // This will create tables automatically
  });

  try {
    await AppDataSource.initialize();
    console.log('Data Source has been initialized!');

    const storeRepository = AppDataSource.getRepository(Store);

    // Use upsert to insert or update stores
    await storeRepository.upsert(stores, {
      conflictPaths: ['name'], // Use 'name' as the unique constraint
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