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

/**
 * Internal store configuration with both name (slug) and displayName.
 */
interface Store {
  /** Store name slug used for cache keys and job data (e.g., 'f2f', '401') */
  name: string;
  /** Human-readable display name used in card.store field (e.g., 'Face to Face Games') */
  displayName: string;
  loader: HTTPLoader;
  parser: Parser;
}

@Injectable()
export class ScraperService implements OnModuleInit {
  private readonly logger = new Logger(ScraperService.name);
  private stores: Store[] = [];
  private storesByName = new Map<string, Store>();

  constructor(
    private readonly storeService: StoreService,
    private readonly proxyService: ProxyService,
  ) {}

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

    // Build lookup map by store name (slug)
    this.storesByName.clear();
    for (const store of this.stores) {
      this.storesByName.set(store.name, store);
    }

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
        loader = new BinderPOSLoader(
          dbStore.baseUrl,
          searchPath,
          this.proxyService.getProxy(),
        );
        parser = new BinderPOSParser(dbStore.baseUrl);
        break;
      default:
        throw new Error(`Unknown scraper type: ${dbStore.scraperType}`);
    }

    return {
      name: dbStore.name, // Slug for cache keys (e.g., 'f2f')
      displayName: dbStore.displayName, // Human-readable name (e.g., 'Face to Face Games')
      loader,
      parser,
    };
  }

  private async fetchCardFromStore(
    cardName: string,
    store: Store,
  ): Promise<{ results: CardWithStore[]; error?: string }> {
    try {
      const data = await store.loader.search(cardName);
      const response = await store.parser.extractItems(data.result);

      // If parser returned an error, this is an API/parsing issue, not "card not found"
      if (response.error) {
        this.logger.error(
          `Store API error from ${store.displayName} for "${cardName}": ${response.error}`,
        );
        return { results: [], error: response.error };
      }

      const results = response.result
        .map((card) => ({ ...card, store: store.displayName })) // Use displayName for card.store
        .filter((card) =>
          card.title
            .toLocaleLowerCase()
            .replaceAll(/[,\\\/]/g, '')
            .startsWith(
              cardName.toLocaleLowerCase().replaceAll(/[,\\\/]/g, ''),
            ),
        );

      if (results.length === 0) {
        this.logger.debug(
          `Card not found in ${store.displayName}: ${cardName}`,
        );
      }

      return { results };
    } catch (error) {
      // Network errors, timeout, etc - log as error
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to fetch from ${store.displayName} for "${cardName}":`,
        error,
      );
      return { results: [], error: `Network error: ${errorMessage}` };
    }
  }

  /**
   * Search for a card at a specific store.
   * This is the primary method used by the scraper processor.
   * @param cardName The card name to search for
   * @param storeName The store name slug (e.g., 'f2f', '401')
   * @returns Results from this store and any error message
   */
  async searchCardAtStore(
    cardName: string,
    storeName: string,
  ): Promise<{ results: CardWithStore[]; error?: string }> {
    const store = this.storesByName.get(storeName);

    if (!store) {
      this.logger.error(`Store not found: ${storeName}`);
      return { results: [], error: `Store not found: ${storeName}` };
    }

    this.logger.log(`Searching for card: ${cardName} at ${store.displayName}`);

    const result = await this.fetchCardFromStore(cardName, store);

    if (result.error) {
      this.logger.warn(
        `Error searching ${cardName} at ${store.displayName}: ${result.error}`,
      );
    } else {
      this.logger.log(
        `Found ${result.results.length} results for: ${cardName} at ${store.displayName}`,
      );
    }

    return result;
  }
}
