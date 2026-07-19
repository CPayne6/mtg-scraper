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
    // Keep regular and deferred Storefront operations on the same per-store,
    // per-proxy limiter. This is deliberately after proxy selection.
    const permit = await this.rateLimiter.acquirePermit(
      store.name,
      proxyNumber,
      store.rateLimitPerSecond || 15,
    );
    if (!permit.allowed) {
      await new Promise((resolve) => setTimeout(resolve, permit.retryAfterMs));
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

    // Undici wraps the real network error in `err.cause` and BullMQ only
    // serializes the top-level message. Rethrow with the cause flattened so
    // "fetch failed" failures show the actual reason (ECONNRESET, timeout,
    // proxy disconnect, etc.) in logs and the Redis failure record.
    let response: Awaited<ReturnType<typeof fetch>>;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query: gql, variables }),
        ...(proxyDispatcher ? { dispatcher: proxyDispatcher } : {}),
        signal: AbortSignal.timeout(15000),
      });
    } catch (err) {
      const cause = (err as { cause?: { code?: string; message?: string } })
        .cause;
      const reason =
        cause?.code ?? cause?.message ?? (err as Error).message;
      throw new Error(
        `fetch failed for ${store.name} via proxy ${proxyNumber}: ${reason}`,
      );
    }

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
   * Execute a Shopify @defer query. Carrier rates are delivered as a
   * multipart/mixed stream, so a successful HTTP response is not complete
   * until its terminal `hasNext: false` part has arrived.
   */
  async queryDeferred<T>(store: Store, gql: string, variables: Record<string, unknown>): Promise<T> {
    const url = this.getEndpointUrl(store);
    let proxyNumber = 0;
    let dispatcher: Dispatcher | undefined;
    if (this.proxyService.isEnabled()) {
      proxyNumber = await this.cacheService.getNextProxyNumber('storefront', this.proxyService.getIpCount());
      dispatcher = this.proxyService.getProxyAgentForNumber(proxyNumber);
    }
    const permit = await this.rateLimiter.acquirePermit(store.name, proxyNumber, store.rateLimitPerSecond || 15);
    if (!permit.allowed) await new Promise((resolve) => setTimeout(resolve, permit.retryAfterMs));
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'multipart/mixed; deferSpec=20220824, application/json',
      'User-Agent': 'Mozilla/5.0 (compatible; ScoutLGS/1.0; +https://scoutlgs.com)',
    };
    if (this.webBotAuth.isEnabled()) Object.assign(headers, await this.webBotAuth.signRequest(proxyNumber, 'POST', url) ?? {});
    let response: Awaited<ReturnType<typeof fetch>>;
    try {
      response = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ query: gql, variables }), ...(dispatcher ? { dispatcher } : {}), signal: AbortSignal.timeout(15000) });
    } catch (error) {
      throw new Error(`Deferred fetch failed for ${store.name}: ${(error as Error).message}`);
    }
    if (!response.ok) throw new Error(`Deferred HTTP ${response.status} from ${store.name}`);
    const raw = await response.text();
    const parts = this.parseDeferredParts(raw, response.headers.get('content-type') ?? '');
    if (!parts.length) throw new Error(`Malformed deferred response from ${store.name}`);
    let result: unknown = {};
    let complete = false;
    for (const part of parts) {
      if (part.errors?.length) throw new Error(`Deferred GraphQL errors from ${store.name}: ${part.errors.map((e: { message?: string }) => e.message ?? 'unknown').join('; ')}`);
      if (part.data) result = this.mergeDeferred(result, part.data);
      for (const incremental of part.incremental ?? []) result = this.applyDeferredIncremental(result, incremental);
      if (part.hasNext === false) complete = true;
    }
    if (!complete) throw new Error(`Incomplete deferred response from ${store.name}`);
    return result as T;
  }

  private parseDeferredParts(raw: string, contentType: string): Array<Record<string, any>> {
    const boundary = /boundary\s*=\s*"?([^";\s]+)"?/i.exec(contentType)?.[1];
    const candidates = contentType.includes('multipart/mixed') && boundary
      ? raw.split(`--${boundary}`)
      : [raw];
    const parts: Array<Record<string, any>> = [];
    for (const candidate of candidates) {
      const body = candidate.trim().replace(/^Content-[^\n]*\r?\n(?:[^\n]*\r?\n)*\r?\n/i, '').trim();
      // The closing multipart boundary can remain as a fragment after split
      // (for example `--graphql--`). It is not a JSON response part.
      if (!body || body === '--' || body.startsWith('--')) continue;
      try { parts.push(JSON.parse(body)); } catch { throw new Error('Malformed multipart JSON'); }
    }
    return parts;
  }

  private mergeDeferred(base: any, addition: any): any {
    if (Array.isArray(base) || Array.isArray(addition)) return addition;
    if (!base || !addition || typeof base !== 'object' || typeof addition !== 'object') return addition;
    const merged = { ...base };
    for (const [key, value] of Object.entries(addition)) merged[key] = key in merged ? this.mergeDeferred(merged[key], value) : value;
    return merged;
  }

  private applyDeferredIncremental(root: any, incremental: { path?: Array<string | number>; data?: unknown; items?: unknown }): any {
    if (!incremental.path) return this.mergeDeferred(root, incremental.data ?? incremental.items ?? {});
    const clone = structuredClone(root);
    let target = clone;
    const path = incremental.path;
    for (let index = 0; index < path.length - 1; index++) {
      const key = path[index];
      const next = path[index + 1];
      target[key] ??= typeof next === 'number' ? [] : {};
      target = target[key];
    }
    const leaf = path[path.length - 1];
    const value = incremental.data ?? incremental.items;
    target[leaf] = Array.isArray(target[leaf]) && Array.isArray(value) ? [...target[leaf], ...value] : this.mergeDeferred(target[leaf], value);
    return clone;
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
