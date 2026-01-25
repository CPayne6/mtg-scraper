import { Injectable, Logger } from '@nestjs/common';
import { Store as StoreEntity } from '@scoutlgs/core';
import { ProxyService } from './proxy/proxy.service';
import { HTTPLoader } from './loaders/HTTPLoader';
import {
  F2FLoader,
  _401Loader,
  HobbiesLoader,
  BinderPOSLoader,
} from './loaders/stores';
import {
  Parser,
  F2FSearchParser,
  _401Parser,
  HobbiesParser,
  BinderPOSParser,
} from './parsers';

interface LoaderEntry {
  createLoader: (proxyService: ProxyService, store: StoreEntity) => HTTPLoader;
  createParser: (store: StoreEntity) => Parser;
}

export interface StoreConfig {
  name: string;
  displayName: string;
  loader: HTTPLoader;
  parser: Parser;
}

@Injectable()
export class LoaderService {
  private readonly logger = new Logger(LoaderService.name);

  private readonly registry: Record<string, LoaderEntry> = {
    f2f: {
      createLoader: (ps) => F2FLoader.create(ps),
      createParser: () => new F2FSearchParser(),
    },
    '401': {
      createLoader: (ps) => _401Loader.create(ps),
      createParser: () => new _401Parser(),
    },
    hobbies: {
      createLoader: (ps) => HobbiesLoader.create(ps),
      createParser: () => new HobbiesParser(),
    },
    binderpos: {
      createLoader: (ps, store) =>
        BinderPOSLoader.create(
          store.baseUrl,
          store.scraperConfig?.searchPath || 'search',
          ps,
        ),
      createParser: (store) => new BinderPOSParser(store.baseUrl),
    },
  };

  constructor(private readonly proxyService: ProxyService) {}

  /**
   * Build a store config with loader and parser for a given store entity.
   * Returns null for unknown scraper types (logs warning, doesn't crash).
   */
  buildStoreConfig(dbStore: StoreEntity): StoreConfig | null {
    const entry = this.registry[dbStore.scraperType];
    if (!entry) {
      this.logger.warn(
        `Unknown scraper type "${dbStore.scraperType}" for store "${dbStore.name}" - skipping`,
      );
      return null;
    }

    return {
      name: dbStore.name,
      displayName: dbStore.displayName,
      loader: entry.createLoader(this.proxyService, dbStore),
      parser: entry.createParser(dbStore),
    };
  }
}
