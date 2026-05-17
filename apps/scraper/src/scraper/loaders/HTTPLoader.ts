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

/** Function that returns a rotating proxy agent for each request */
export type GetProxyAgentFn = () => Promise<undici.ProxyAgent | undefined>;

export abstract class HTTPLoader {
  private static readonly REQUEST_TIMEOUT_MS = 10000;
  protected readonly logger = new Logger(this.constructor.name);

  constructor(protected readonly getProxyAgent?: GetProxyAgentFn) {}

  /**
   * Truncate response body for logging (avoid huge log entries).
   */
  private truncateForLog(body: string, maxLength = 500): string {
    if (body.length <= maxLength) return body;
    return body.substring(0, maxLength) + `... [truncated, total ${body.length} chars]`;
  }

  /**
   * Extract useful headers for debugging.
   */
  private extractDebugHeaders(headers: Headers): Record<string, string> {
    const debugHeaders: Record<string, string> = {};
    const interestingHeaders = [
      'cf-ray', 'cf-cache-status', 'retry-after', 'x-ratelimit-remaining',
      'x-ratelimit-limit', 'x-ratelimit-reset', 'server', 'content-type'
    ];
    for (const name of interestingHeaders) {
      const value = headers.get(name);
      if (value) debugHeaders[name] = value;
    }
    return debugHeaders;
  }

  /**
   * Log detailed error information for debugging.
   */
  private logErrorDetails(
    level: 'warn' | 'error',
    url: string,
    status: number,
    errorType: ScrapeErrorType,
    message: string,
    headers?: Record<string, string>,
    bodySnippet?: string,
  ): void {
    const details = {
      url,
      status,
      errorType,
      message,
      ...(headers && Object.keys(headers).length > 0 ? { headers } : {}),
      ...(bodySnippet ? { bodySnippet } : {}),
    };

    if (level === 'error') {
      this.logger.error(`Request failed: ${JSON.stringify(details)}`);
    } else {
      this.logger.warn(`Request failed: ${JSON.stringify(details)}`);
    }
  }

  /**
   * Detects Cloudflare error pages specifically.
   * We only check for Cloudflare error codes which are reliable indicators.
   * All other error detection relies on HTTP status codes.
   */
  private detectCloudflareError(body: string, status: number): ScrapeError | null {
    // Cloudflare error detection - these have a specific format
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
      // Get rotating proxy agent for this request (if proxy is configured)
      const proxyAgent = this.getProxyAgent
        ? await this.getProxyAgent()
        : undefined;

      const res = await undici.fetch(url, {
        method,
        body,
        dispatcher: proxyAgent,
        signal: AbortSignal.timeout(HTTPLoader.REQUEST_TIMEOUT_MS),
        headers:
          typeof body === 'string'
            ? new Headers({ 'content-type': 'application/json;' })
            : undefined,
      });

      const responseBody = await res.text();

      const debugHeaders = this.extractDebugHeaders(res.headers);

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

        this.logErrorDetails(
          'warn',
          url,
          res.status,
          error.type,
          error.message,
          debugHeaders,
          this.truncateForLog(responseBody),
        );

        return { body: responseBody, status: res.status, error };
      }

      // Check for Cloudflare error pages (they sometimes return 200 with error HTML)
      const cfError = this.detectCloudflareError(responseBody, res.status);
      if (cfError) {
        this.logErrorDetails(
          'warn',
          url,
          res.status,
          cfError.type,
          cfError.message,
          debugHeaders,
          this.truncateForLog(responseBody),
        );

        return { body: responseBody, status: res.status, error: cfError };
      }

      return { body: responseBody, status: res.status };
    } catch (error) {
      // Network errors (timeout, connection refused, etc.)
      const scrapeError = ScrapeError.fromNetworkError(
        error instanceof Error ? error : new Error(String(error)),
        url,
      );

      this.logErrorDetails(
        'error',
        url,
        0,
        scrapeError.type,
        scrapeError.message,
      );

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
    /** Server-provided retry-after value in seconds (from 429 responses) */
    retryAfter?: number;
  }>;
}
