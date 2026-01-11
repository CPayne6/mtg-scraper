import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CardWithStore } from '@scoutlgs/shared';
import { StoreService, Store as StoreEntity } from '@scoutlgs/core';
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
import { ProxyService } from './proxy/proxy.service';

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

  constructor(private readonly storeService: StoreService, private readonly proxyService: ProxyService) {}

  async onModuleInit() {
    await this.loadStoresFromDatabase();
  }

  /**
   * Wait until stores have been successfully loaded from the database.
   * Use this to ensure the service is ready before processing requests.
   */
  async waitUntilReady(): Promise<void> {
    await this.storeService.waitUntilReady();
  }

  /**
   * Check if stores have been successfully loaded.
   */
  ready(): boolean {
    return this.storeService.ready();
  }

  private async loadStoresFromDatabase() {
    await this.storeService.waitUntilReady();
    const dbStores = await this.storeService.findAllActive();
    this.stores = dbStores.map((store) => this.buildStoreConfig(store));
    this.logger.log(`Loaded ${this.stores.length} stores from database`);
  }

  private buildStoreConfig(dbStore: StoreEntity): Store {
    let loader: HTTPLoader;
    let parser: Parser;

    switch (dbStore.scraperType) {
      case 'f2f':
        loader = new F2FLoader(this.proxyService.getProxy());
        parser = new F2FSearchParser();
        break;
      case '401':
        loader = new _401Loader(this.proxyService.getProxy());
        parser = new _401Parser();
        break;
      case 'hobbies':
        loader = new HobbiesLoader(this.proxyService.getProxy());
        parser = new HobbiesParser();
        break;
      case 'binderpos':
        const searchPath = dbStore.scraperConfig?.searchPath || 'search';
        loader = new BinderPOSLoader(dbStore.baseUrl, searchPath, this.proxyService.getProxy());
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
