import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CardWithStore } from '@mtg-scraper/shared';
import { StoreService } from '../store/store.service';
import { Store as StoreEntity } from '../store/entities/store.entity';
import {
  _401Loader,
  BinderPOSLoader,
  F2FLoader,
  HobbiesLoader,
  HTTPLoader,
} from './loaders';
import {
  _401Parser,
  BinderPOSParser,
  F2FSearchParser,
  HobbiesParser,
  Parser,
} from './parsers';

interface Store {
  name: string;
  loader: HTTPLoader;
  parser: Parser;
}

interface CacheValue {
  timestamp: number;
  value: CardWithStore[];
}

@Injectable()
export class ScraperService implements OnModuleInit {
  private readonly logger = new Logger(ScraperService.name);
  private stores: Store[] = [];
  private readonly cache = new Map<string, CacheValue>();
  private readonly cacheTTL = 86400000; // 1 day

  constructor(private readonly storeService: StoreService) {}

  async onModuleInit() {
    await this.loadStoresFromDatabase();
  }

  private async loadStoresFromDatabase() {
    try {
      const dbStores = await this.storeService.findAllActive();
      this.stores = dbStores.map((store) => this.buildStoreConfig(store));
      this.logger.log(`Loaded ${this.stores.length} stores from database`);
    } catch (error) {
      this.logger.error('Failed to load stores from database:', error);
      this.logger.warn('Falling back to hardcoded stores');
      this.loadHardcodedStores();
    }
  }

  private buildStoreConfig(dbStore: StoreEntity): Store {
    let loader: HTTPLoader;
    let parser: Parser;

    switch (dbStore.scraperType) {
      case 'f2f':
        loader = new F2FLoader();
        parser = new F2FSearchParser();
        break;
      case '401':
        loader = new _401Loader();
        parser = new _401Parser();
        break;
      case 'hobbies':
        loader = new HobbiesLoader();
        parser = new HobbiesParser();
        break;
      case 'binderpos':
        const searchPath = dbStore.scraperConfig?.searchPath || 'search';
        loader = new BinderPOSLoader(dbStore.baseUrl, searchPath);
        parser = new BinderPOSParser(dbStore.baseUrl);
        break;
      default:
        throw new Error(`Unknown scraper type: ${dbStore.scraperType}`);
    }

    return {
      name: dbStore.displayName,
      loader,
      parser,
    };
  }

  private loadHardcodedStores() {
    // Fallback to existing hardcoded stores if database fails
    this.stores = [
      {
        name: 'Face to Face Games',
        loader: new F2FLoader(),
        parser: new F2FSearchParser(),
      },
      {
        name: '401 Games',
        loader: new _401Loader(),
        parser: new _401Parser(),
      },
      {
        name: 'Hobbiesville',
        loader: new HobbiesLoader(),
        parser: new HobbiesParser(),
      },
      {
        name: 'House of Cards',
        loader: new BinderPOSLoader(
          'https://houseofcards.ca',
          'mtg-advanced-search'
        ),
        parser: new BinderPOSParser('https://houseofcards.ca'),
      },
      {
        name: 'Black Knight Games',
        loader: new BinderPOSLoader(
          'https://blackknightgames.ca',
          'magic-the-gathering-search'
        ),
        parser: new BinderPOSParser('https://blackknightgames.ca'),
      },
      {
        name: 'Exor Games',
        loader: new BinderPOSLoader('https://exorgames.com', 'advanced-search'),
        parser: new BinderPOSParser('https://exorgames.com'),
      },
      {
        name: 'Game Knight',
        loader: new BinderPOSLoader(
          'https://gameknight.ca',
          'magic-the-gathering-singles'
        ),
        parser: new BinderPOSParser('https://gameknight.ca'),
      },
    ];
    this.logger.log(`Loaded ${this.stores.length} hardcoded stores as fallback`);
  }

  private async fetchCardFromStore(
    cardName: string,
    store: Store
  ): Promise<CardWithStore[]> {
    const cacheKey = `${store.name}-${cardName}`;

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      this.logger.debug(`Cache hit for ${cacheKey}`);
      return cached.value;
    }

    // Fetch from store
    try {
      const data = await store.loader.search(cardName);
      const response = await store.parser.extractItems(data.result);

      const results = response.result
        .map((card) => ({ ...card, store: store.name }))
        .filter((card) =>
          card.title
            .toLocaleLowerCase()
            .replaceAll(/[,\\\/]/g, '')
            .startsWith(cardName.toLocaleLowerCase().replaceAll(/[,\\\/]/g, ''))
        );

      // Cache successful results
      if (!response.error) {
        this.cache.set(cacheKey, {
          timestamp: Date.now(),
          value: results,
        });
      }

      return results;
    } catch (error) {
      this.logger.error(
        `Failed to fetch from ${store.name} for ${cardName}:`,
        error
      );
      throw error;
    }
  }

  async searchCard(cardName: string): Promise<CardWithStore[]> {
    this.logger.log(`Searching for card: ${cardName}`);

    const cards: CardWithStore[] = [];
    const cardPromises = this.stores.map((store) =>
      this.fetchCardFromStore(cardName, store)
    );

    // Use Promise.allSettled to handle individual store failures gracefully
    const results = await Promise.allSettled(cardPromises);

    for (const result of results) {
      if (result.status === 'fulfilled') {
        cards.push(...result.value);
      } else {
        this.logger.warn('Store fetch failed:', result.reason);
      }
    }

    const sortedCards = cards.sort((a, b) => a.price - b.price);
    this.logger.log(`Found ${sortedCards.length} results for: ${cardName}`);

    return sortedCards;
  }
}
