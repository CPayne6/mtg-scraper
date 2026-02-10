import { Inject, Injectable, Logger } from '@nestjs/common';
import { Store as StoreEntity } from '@scoutlgs/core';
import { GetProxyAgentFn, HTTPLoader } from './loaders/HTTPLoader';
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
  createLoader: (getProxyAgent: GetProxyAgentFn, store: StoreEntity) => HTTPLoader;
  createParser: (store: StoreEntity) => Parser;
}

export interface StoreConfig {
  name: string;
  displayName: string;
  loader: HTTPLoader;
  parser: Parser;
  scraperType: string;
}

/** Factory function that creates a GetProxyAgentFn for a given scraper type */
export type ProxyAgentFactory = (scraperType: string) => GetProxyAgentFn;

/** Injection token for the proxy agent factory */
export const PROXY_AGENT_FACTORY = Symbol('PROXY_AGENT_FACTORY');

@Injectable()
export class LoaderService {
  private readonly logger = new Logger(LoaderService.name);

  private readonly registry: Record<string, LoaderEntry> = {
    f2f: {
      createLoader: (getProxyAgent) => F2FLoader.create(getProxyAgent),
      createParser: () => new F2FSearchParser(),
    },
    '401': {
      createLoader: (getProxyAgent) => _401Loader.create(getProxyAgent),
      createParser: () => new _401Parser(),
    },
    hobbies: {
      createLoader: (getProxyAgent) => HobbiesLoader.create(getProxyAgent),
      createParser: () => new HobbiesParser(),
    },
    binderpos: {
      createLoader: (getProxyAgent, store) =>
        BinderPOSLoader.create(
          store.baseUrl,
          store.scraperConfig?.searchPath || 'search',
          getProxyAgent,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (store.scraperConfig as any)?.shopifyUrl, // Skip initial page fetch if URL is known
        ),
      createParser: (store) => new BinderPOSParser(store.baseUrl),
    },
  };

  constructor(
    @Inject(PROXY_AGENT_FACTORY)
    private readonly createProxyAgentFn: ProxyAgentFactory,
  ) {}

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

    const getProxyAgent = this.createProxyAgentFn(dbStore.scraperType);

    return {
      name: dbStore.name,
      displayName: dbStore.displayName,
      loader: entry.createLoader(getProxyAgent, dbStore),
      parser: entry.createParser(dbStore),
      scraperType: dbStore.scraperType,
    };
  }
}
