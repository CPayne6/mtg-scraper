import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CardWithStore, StoreError } from '@scoutlgs/shared';
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

@Injectable()
export class ScraperService implements OnModuleInit {
  private readonly logger = new Logger(ScraperService.name);
  private stores: Store[] = [];

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
  ): Promise<{ results: CardWithStore[]; error?: string }> {
    try {
      const data = await store.loader.search(cardName);
      const response = await store.parser.extractItems(data.result);

      // If parser returned an error, this is an API/parsing issue, not "card not found"
      if (response.error) {
        this.logger.error(
          `Store API error from ${store.name} for "${cardName}": ${response.error}`
        );
        return { results: [], error: response.error };
      }

      const results = response.result
        .map((card) => ({ ...card, store: store.name }))
        .filter((card) =>
          card.title
            .toLocaleLowerCase()
            .replaceAll(/[,\\\/]/g, '')
            .startsWith(cardName.toLocaleLowerCase().replaceAll(/[,\\\/]/g, ''))
        );

      if (results.length === 0) {
        this.logger.debug(`Card not found in ${store.name}: ${cardName}`);
      }

      return { results };
    } catch (error) {
      // Network errors, timeout, etc - log as error
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to fetch from ${store.name} for "${cardName}":`,
        error
      );
      return { results: [], error: `Network error: ${errorMessage}` };
    }
  }

  async searchCard(cardName: string, storeNames?: string[]): Promise<{ results: CardWithStore[]; storeErrors: StoreError[] }> {
    // Filter stores if specific store names are provided
    const storesToSearch = storeNames?.length
      ? this.stores.filter((store) => storeNames.includes(store.name))
      : this.stores;

    if (storeNames?.length) {
      this.logger.log(`Searching for card: ${cardName} in specific stores: ${storeNames.join(', ')}`);
    } else {
      this.logger.log(`Searching for card: ${cardName}`);
    }

    const cards: CardWithStore[] = [];
    const storeErrors: StoreError[] = [];

    // Fetch from stores and track errors
    const fetchResults = await Promise.all(
      storesToSearch.map(async (store) => {
        const result = await this.fetchCardFromStore(cardName, store);

        if (result.error) {
          storeErrors.push({ storeName: store.name, error: result.error });
        }

        return result.results;
      })
    );

    // Flatten all results
    cards.push(...fetchResults.flat());

    const sortedCards = cards.sort((a, b) => a.price - b.price);

    if (storeErrors.length > 0) {
      this.logger.warn(
        `Found ${sortedCards.length} results for: ${cardName} (${storeErrors.length} store(s) had errors)`
      );
    } else {
      this.logger.log(`Found ${sortedCards.length} results for: ${cardName}`);
    }

    return { results: sortedCards, storeErrors };
  }
}
