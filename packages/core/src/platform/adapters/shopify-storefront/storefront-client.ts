import { Injectable, Logger } from '@nestjs/common';
import { fetch } from 'undici';
import type { Dispatcher } from 'undici';
import type { Store } from '../../../database/store.entity';
import { ProxyService } from '../../../proxy/proxy.service';
import { CacheService } from '../../../cache/cache.service';
import { RateLimiterService } from '../../../rate-limiter/rate-limiter.service';
import { WebBotAuthService } from '../../../web-bot-auth/web-bot-auth.service';
import { ExtractionHttpError } from '../shopify/extraction-http-error';
import { getStorefrontApiVersion } from './storefront.queries';
import type { StorefrontGraphQLResponse } from './storefront.types';

@Injectable()
export class StorefrontClient {
  private readonly logger = new Logger(StorefrontClient.name);

  constructor(
    private readonly proxyService: ProxyService,
    private readonly cacheService: CacheService,
    private readonly rateLimiter: RateLimiterService,
    private readonly webBotAuth: WebBotAuthService,
  ) {}

  /**
   * Execute a GraphQL query against a store's Shopify Storefront API endpoint.
   *
   * Routes each request through a rotating proxy IP from the Webshare pool
   * because Shopify's Storefront API rate limit is scoped per buyer IP, not
   * per shop — so rotating IPs gives each request its own bucket and
   * dramatically increases sustained throughput across the cluster.
   *
   * Web Bot Auth signs with the per-proxy key matching the chosen IP so
   * Shopify sees a consistent (signing key ↔ IP) pair per request.
   */
  async query<T>(
    store: Store,
    gql: string,
    variables: Record<string, unknown>,
    dispatcher?: Dispatcher,
  ): Promise<T> {
    const url = this.getEndpointUrl(store);

    // Pick the next proxy in the rotation (atomic Redis INCR across workers).
    // proxyNumber 0 means "no proxy" — used when proxies are disabled or the
    // caller explicitly passed its own dispatcher.
    let proxyNumber = 0;
    let proxyDispatcher: Dispatcher | undefined = dispatcher;
    if (!dispatcher && this.proxyService.isEnabled()) {
      proxyNumber = await this.cacheService.getNextProxyNumber(
        'storefront',
        this.proxyService.getIpCount(),
      );
      proxyDispatcher = this.proxyService.getProxyAgentForNumber(proxyNumber);
    }

    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent':
        'Mozilla/5.0 (compatible; ScoutLGS/1.0; +https://scoutlgs.com)',
      Accept: 'application/json',
    };

    // Web Bot Auth signing — signed with the key matching the proxy IP so
    // Shopify sees a consistent (key, IP) pair per request.
    if (this.webBotAuth.isEnabled()) {
      const authHeaders = await this.webBotAuth.signRequest(
        proxyNumber,
        'POST',
        url,
      );
      if (authHeaders) {
        Object.assign(headers, authHeaders);
      }
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: gql, variables }),
      ...(proxyDispatcher ? { dispatcher: proxyDispatcher } : {}),
      signal: AbortSignal.timeout(15000),
    });

    // Handle HTTP-level errors
    if (!response.ok) {
      const retryAfter = response.headers.get('retry-after');
      const retryAfterSeconds = retryAfter
        ? parseInt(retryAfter, 10)
        : undefined;

      if (response.status === 429) {
        throw new ExtractionHttpError(
          `HTTP 429 Too Many Requests from ${store.name}`,
          429,
          url,
          retryAfterSeconds,
        );
      }

      if (response.status === 430) {
        throw new ExtractionHttpError(
          `HTTP 430 Shopify security rejection from ${store.name}`,
          430,
          url,
        );
      }

      if (response.status >= 500) {
        throw new ExtractionHttpError(
          `HTTP ${response.status} ${response.statusText} from ${store.name}`,
          response.status,
          url,
          retryAfterSeconds,
        );
      }

      throw new ExtractionHttpError(
        `HTTP ${response.status} ${response.statusText} from ${store.name}`,
        response.status,
        url,
        retryAfterSeconds,
      );
    }

    // Parse GraphQL response
    const body =
      (await response.json()) as StorefrontGraphQLResponse<T>;

    // Handle GraphQL-level errors
    if (body.errors && body.errors.length > 0) {
      const isThrottled = body.errors.some(
        (e) =>
          e.extensions?.code === 'THROTTLED' ||
          e.message.includes('Throttled'),
      );

      if (isThrottled) {
        // Compute backoff from throttle status if available
        let retryAfterSeconds: number | undefined;
        const throttleStatus = body.extensions?.cost?.throttleStatus;
        if (throttleStatus && throttleStatus.restoreRate > 0) {
          const deficit =
            (body.extensions!.cost.requestedQueryCost ?? 0) -
            throttleStatus.currentlyAvailable;
          if (deficit > 0) {
            retryAfterSeconds = Math.ceil(deficit / throttleStatus.restoreRate);
          }
        }

        throw new ExtractionHttpError(
          `GraphQL throttled at ${store.name}: ${body.errors[0].message}`,
          429,
          url,
          retryAfterSeconds,
        );
      }

      // Non-throttle GraphQL errors
      const messages = body.errors.map((e) => e.message).join('; ');
      throw new Error(
        `GraphQL errors from ${store.name}: ${messages}`,
      );
    }

    return body.data as T;
  }

  /**
   * Build the Storefront API GraphQL endpoint URL for a store.
   */
  getEndpointUrl(store: Store): string {
    const host =
      store.scraperConfig?.shopifyUrl || new URL(store.baseUrl).host;
    const apiVersion =
      store.scraperConfig?.storefrontApiVersion || getStorefrontApiVersion();
    return `https://${host}/api/${apiVersion}/graphql.json`;
  }
}
