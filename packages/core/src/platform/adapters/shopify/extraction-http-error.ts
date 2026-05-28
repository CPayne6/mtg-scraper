/**
 * Error thrown during extraction with HTTP context
 */
export class ExtractionHttpError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly url: string,
    public readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'ExtractionHttpError';
  }
}
