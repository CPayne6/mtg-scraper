import * as undici from 'undici';

export abstract class HTTPLoader {
  private static readonly REQUEST_TIMEOUT_MS = 10000;

  constructor(protected readonly proxyAgent?: undici.ProxyAgent) {}

  /**
   * Attempt to fetch with retries
   *
   * @param input
   * @param options
   * @param retries
   * @returns
   */
  private async fetchWithRetry(
    input: undici.RequestInfo,
    options?: undici.RequestInit,
    retries = 1,
  ): Promise<undici.Response> {
    try {
      const res = await undici.fetch(input, {
        ...options,
        dispatcher: this.proxyAgent,
        signal: AbortSignal.timeout(HTTPLoader.REQUEST_TIMEOUT_MS),
      });
      return res;
    } catch (error) {
      if (retries > 0) {
        console.warn(
          `Fetch failed for ${input}. Retrying... (${retries} retries left)`,
        );
        return this.fetchWithRetry(input, options, retries - 1);
      } else {
        console.error(`Fetch failed for ${input}. No more retries left.`);
        throw error;
      }
    }
  }

  async loadPage(url: string, body?: string, method?: string) {
    const res = await this.fetchWithRetry(url, {
      method,
      body,
      headers:
        typeof body === 'string'
          ? new Headers({ 'content-type': 'application/json;' })
          : undefined,
    });
    return res.text();
  }

  abstract search(
    name: string,
    params?: URLSearchParams,
  ): Promise<{ result: string; api: string; error?: boolean | string }>;
}
