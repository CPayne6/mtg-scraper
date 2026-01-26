/**
 * Error classification for scraper errors based on HTTP status codes.
 * This helps determine retry strategies and error reporting.
 */
export enum ScrapeErrorType {
  /** Network errors (connection refused, DNS failure, timeout) */
  NETWORK = 'NETWORK',
  /** 429 Too Many Requests - Rate limited by the server */
  RATE_LIMITED = 'RATE_LIMITED',
  /** 502/503/504 - Backend infrastructure issues */
  BAD_GATEWAY = 'BAD_GATEWAY',
  /** 403 - Forbidden, possibly blocked by WAF/Cloudflare */
  FORBIDDEN = 'FORBIDDEN',
  /** 404 - Resource not found */
  NOT_FOUND = 'NOT_FOUND',
  /** 5xx errors other than 502/503/504 */
  SERVER_ERROR = 'SERVER_ERROR',
  /** 4xx errors other than 403/404/429 */
  CLIENT_ERROR = 'CLIENT_ERROR',
  /** Response received but content indicates an error (HTML error page, etc.) */
  INVALID_RESPONSE = 'INVALID_RESPONSE',
  /** Parsing errors */
  PARSE_ERROR = 'PARSE_ERROR',
  /** Unknown/unclassified errors */
  UNKNOWN = 'UNKNOWN',
}

/**
 * Determines whether an error type is potentially recoverable with retries.
 */
export function isRetryable(errorType: ScrapeErrorType): boolean {
  switch (errorType) {
    case ScrapeErrorType.NETWORK:
    case ScrapeErrorType.BAD_GATEWAY:
    case ScrapeErrorType.SERVER_ERROR:
      return true;
    case ScrapeErrorType.RATE_LIMITED:
      // Rate limited is retryable but should wait longer
      return true;
    case ScrapeErrorType.FORBIDDEN:
    case ScrapeErrorType.NOT_FOUND:
    case ScrapeErrorType.CLIENT_ERROR:
    case ScrapeErrorType.INVALID_RESPONSE:
    case ScrapeErrorType.PARSE_ERROR:
    case ScrapeErrorType.UNKNOWN:
      return false;
  }
}

/**
 * Classifies HTTP status codes into error types.
 */
export function classifyHttpStatus(status: number): ScrapeErrorType | null {
  if (status >= 200 && status < 300) {
    return null; // Success
  }

  switch (status) {
    case 429:
      return ScrapeErrorType.RATE_LIMITED;
    case 403:
      return ScrapeErrorType.FORBIDDEN;
    case 404:
      return ScrapeErrorType.NOT_FOUND;
    case 502:
    case 503:
    case 504:
      return ScrapeErrorType.BAD_GATEWAY;
    default:
      if (status >= 500) {
        return ScrapeErrorType.SERVER_ERROR;
      }
      if (status >= 400) {
        return ScrapeErrorType.CLIENT_ERROR;
      }
      return ScrapeErrorType.UNKNOWN;
  }
}

/**
 * Custom error class for scraping operations with HTTP status information.
 */
export class ScrapeError extends Error {
  public readonly type: ScrapeErrorType;
  public readonly statusCode?: number;
  public readonly retryAfter?: number;
  public readonly url?: string;
  public readonly cause?: Error;

  constructor(
    message: string,
    type: ScrapeErrorType,
    options?: {
      statusCode?: number;
      retryAfter?: number;
      url?: string;
      cause?: Error;
    },
  ) {
    super(message);
    this.name = 'ScrapeError';
    this.type = type;
    this.statusCode = options?.statusCode;
    this.retryAfter = options?.retryAfter;
    this.url = options?.url;
    this.cause = options?.cause;
  }

  /**
   * Creates a ScrapeError from an HTTP response.
   */
  static fromResponse(
    response: { status: number; statusText: string; headers?: Headers },
    url: string,
    body?: string,
  ): ScrapeError {
    const type = classifyHttpStatus(response.status) ?? ScrapeErrorType.UNKNOWN;
    const retryAfter = response.headers?.get('retry-after');
    const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : undefined;

    let message = `HTTP ${response.status} ${response.statusText}`;

    // Add context based on error type
    switch (type) {
      case ScrapeErrorType.RATE_LIMITED:
        message = `Rate limited (429)${retryAfterSeconds ? ` - retry after ${retryAfterSeconds}s` : ''}`;
        break;
      case ScrapeErrorType.BAD_GATEWAY:
        message = `Bad gateway (${response.status}) - backend server error`;
        break;
      case ScrapeErrorType.FORBIDDEN:
        message = `Forbidden (403) - possibly blocked by WAF`;
        break;
      case ScrapeErrorType.NOT_FOUND:
        message = `Not found (404)`;
        break;
    }

    // Check for Cloudflare error codes in body
    if (body) {
      const cfError = body.match(/error code (\d+)/i);
      if (cfError) {
        message += ` [Cloudflare error ${cfError[1]}]`;
      }
    }

    return new ScrapeError(message, type, {
      statusCode: response.status,
      retryAfter: retryAfterSeconds,
      url,
    });
  }

  /**
   * Creates a ScrapeError from a network error.
   */
  static fromNetworkError(error: Error, url: string): ScrapeError {
    let type = ScrapeErrorType.NETWORK;
    let message = error.message;

    // Classify common network error patterns
    if (
      error.name === 'AbortError' ||
      error.message.includes('timeout') ||
      error.message.includes('ETIMEDOUT')
    ) {
      message = `Request timeout`;
    } else if (
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('ECONNRESET')
    ) {
      message = `Connection refused/reset`;
    } else if (error.message.includes('ENOTFOUND')) {
      message = `DNS lookup failed`;
    }

    return new ScrapeError(message, type, { url, cause: error });
  }

  /**
   * Check if this error is retryable.
   */
  isRetryable(): boolean {
    return isRetryable(this.type);
  }

  /**
   * Get a short code for logging/metrics.
   */
  getShortCode(): string {
    if (this.statusCode) {
      return `${this.type}:${this.statusCode}`;
    }
    return this.type;
  }
}
