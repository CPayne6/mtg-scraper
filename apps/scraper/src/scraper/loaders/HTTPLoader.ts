import { Logger } from '@nestjs/common';
import * as undici from 'undici';
import { ScrapeError, ScrapeErrorType } from '../errors';

export interface LoadPageResult {
  /** The response body text */
  body: string;
  /** HTTP status code */
  status: number;
  /** Error if status is not 2xx or response indicates an error */
  error?: ScrapeError;
}

export abstract class HTTPLoader {
  private static readonly REQUEST_TIMEOUT_MS = 10000;
  protected readonly logger = new Logger(this.constructor.name);

  constructor(protected readonly proxyAgent?: undici.ProxyAgent) {}

  /**
   * Attempt to fetch with retries for network errors only.
   * HTTP errors (4xx, 5xx) are not retried - they're returned for classification.
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
        this.logger.warn(
          `Network error for ${input}. Retrying... (${retries} retries left)`,
        );
        return this.fetchWithRetry(input, options, retries - 1);
      } else {
        this.logger.error(`Network error for ${input}. No more retries left.`);
        throw error;
      }
    }
  }

  /**
   * Detects if an HTML response indicates an error page (Cloudflare block, etc.)
   */
  private detectHtmlError(body: string, status: number): ScrapeError | null {
    const bodyLower = body.toLowerCase();

    // Check for HTML error pages
    if (!bodyLower.includes('<!doctype') && !bodyLower.includes('<html')) {
      return null;
    }

    // Cloudflare error detection
    const cfErrorMatch = body.match(/error code[:\s]+(\d+)/i);
    if (cfErrorMatch) {
      const cfCode = parseInt(cfErrorMatch[1], 10);
      // Error 1015 is Cloudflare rate limiting
      if (cfCode === 1015) {
        return new ScrapeError(
          `Cloudflare rate limit (error 1015)`,
          ScrapeErrorType.RATE_LIMITED,
          { statusCode: status },
        );
      }
      return new ScrapeError(
        `Cloudflare error ${cfCode}`,
        ScrapeErrorType.FORBIDDEN,
        { statusCode: status },
      );
    }

    // Generic blocking indicators
    if (
      bodyLower.includes('rate limit') ||
      bodyLower.includes('too many requests')
    ) {
      return new ScrapeError(
        `Rate limited (detected in response body)`,
        ScrapeErrorType.RATE_LIMITED,
        { statusCode: status },
      );
    }

    if (
      bodyLower.includes('blocked') ||
      bodyLower.includes('access denied') ||
      bodyLower.includes('forbidden')
    ) {
      return new ScrapeError(
        `Blocked (detected in response body)`,
        ScrapeErrorType.FORBIDDEN,
        { statusCode: status },
      );
    }

    // 502/503/504 Bad Gateway pages
    if (
      bodyLower.includes('bad gateway') ||
      bodyLower.includes('service unavailable') ||
      bodyLower.includes('gateway timeout')
    ) {
      return new ScrapeError(
        `Bad gateway (detected in response body)`,
        ScrapeErrorType.BAD_GATEWAY,
        { statusCode: status },
      );
    }

    return null;
  }

  /**
   * Load a page and return detailed result with status information.
   */
  async loadPageWithStatus(
    url: string,
    body?: string,
    method?: string,
  ): Promise<LoadPageResult> {
    try {
      const res = await this.fetchWithRetry(url, {
        method,
        body,
        headers:
          typeof body === 'string'
            ? new Headers({ 'content-type': 'application/json;' })
            : undefined,
      });

      const responseBody = await res.text();

      // Check for HTTP error status
      if (!res.ok) {
        const error = ScrapeError.fromResponse(
          {
            status: res.status,
            statusText: res.statusText,
            headers: res.headers,
          },
          url,
          responseBody,
        );
        this.logger.warn(`HTTP error ${res.status} for ${url}: ${error.message}`);
        return { body: responseBody, status: res.status, error };
      }

      // Check for HTML error pages even on 200 OK (some services return 200 with error HTML)
      const htmlError = this.detectHtmlError(responseBody, res.status);
      if (htmlError) {
        this.logger.warn(`HTML error detected for ${url}: ${htmlError.message}`);
        return { body: responseBody, status: res.status, error: htmlError };
      }

      return { body: responseBody, status: res.status };
    } catch (error) {
      // Network errors (timeout, connection refused, etc.)
      const scrapeError = ScrapeError.fromNetworkError(
        error instanceof Error ? error : new Error(String(error)),
        url,
      );
      this.logger.error(`Network error for ${url}: ${scrapeError.message}`);
      return { body: '', status: 0, error: scrapeError };
    }
  }

  /**
   * Legacy method for backward compatibility.
   * @deprecated Use loadPageWithStatus for better error handling.
   */
  async loadPage(url: string, body?: string, method?: string): Promise<string> {
    const result = await this.loadPageWithStatus(url, body, method);
    if (result.error) {
      throw result.error;
    }
    return result.body;
  }

  abstract search(
    name: string,
    params?: URLSearchParams,
  ): Promise<{
    result: string;
    api: string;
    status?: number;
    error?: string;
    errorType?: ScrapeErrorType;
    retryable?: boolean;
  }>;
}
