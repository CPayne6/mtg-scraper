import { Injectable, Logger } from '@nestjs/common';
import type { PlatformType } from '@scoutlgs/shared';
import type { IExtractionAdapter } from './platform.interfaces';
import { StorefrontExtractionAdapter } from './adapters/shopify-storefront/storefront-extraction.adapter';

/**
 * Factory for creating platform-specific adapters
 * Uses dependency injection to manage adapter instances
 */
@Injectable()
export class PlatformAdapterFactory {
  private readonly logger = new Logger(PlatformAdapterFactory.name);

  constructor(
    private readonly storefrontExtraction: StorefrontExtractionAdapter,
  ) {}

  /**
   * Get the extraction adapter for a given platform type
   */
  getExtractionAdapter(platformType: PlatformType): IExtractionAdapter {
    switch (platformType) {
      case 'shopify_storefront':
        return this.storefrontExtraction;
      case 'conduct_commerce':
        throw new Error('ConductCommerce extraction adapter not yet implemented');
      default:
        throw new Error(`No extraction adapter for platform: ${platformType}`);
    }
  }

  /**
   * Check if a platform type is supported
   */
  isSupported(platformType: PlatformType): boolean {
    return platformType === 'shopify_storefront';
  }
}
