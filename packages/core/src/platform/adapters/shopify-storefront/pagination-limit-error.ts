/**
 * Thrown when a Shopify Storefront `products()` query hits the documented
 * 25K cursor-pagination depth limit. The exact GraphQL error message is
 * "Platform limit for pagination (25000 items) exceeded by 250 items."
 *
 * Bucket-job processors catch this to split the date range and re-enqueue
 * two sub-buckets instead of failing the whole chain.
 */
export class StorefrontPaginationLimitError extends Error {
  constructor(
    message: string,
    public readonly storeName: string,
  ) {
    super(message);
    this.name = 'StorefrontPaginationLimitError';
  }

  static MESSAGE_NEEDLE = 'Platform limit for pagination';

  static isPaginationLimitMessage(message: string): boolean {
    return message.includes(StorefrontPaginationLimitError.MESSAGE_NEEDLE);
  }
}
