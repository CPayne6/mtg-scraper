import { Injectable, Logger } from '@nestjs/common';
import type { PlatformType } from '@scoutlgs/shared';
import type { IDiscoveryAdapter, IExtractionAdapter } from './platform.interfaces';
import { ShopifyDiscoveryAdapter } from './adapters/shopify/shopify-discovery.adapter';
import { ShopifyExtractionAdapter } from './adapters/shopify/shopify-extraction.adapter';

/**
 * Factory for creating platform-specific adapters
 * Uses dependency injection to manage adapter instances
 */
@Injectable()
export class PlatformAdapterFactory {
  private readonly logger = new Logger(PlatformAdapterFactory.name);

  constructor(
    private readonly shopifyDiscovery: ShopifyDiscoveryAdapter,
    private readonly shopifyExtraction: ShopifyExtractionAdapter,
    // Future: ConductCommerce adapters
    // private readonly conductCommerceDiscovery: ConductCommerceDiscoveryAdapter,
    // private readonly conductCommerceExtraction: ConductCommerceExtractionAdapter,
  ) {}

  /**
   * Get the discovery adapter for a given platform type
   */
  getDiscoveryAdapter(platformType: PlatformType): IDiscoveryAdapter {
    switch (platformType) {
      case 'shopify':
        return this.shopifyDiscovery;
      case 'conduct_commerce':
        throw new Error('ConductCommerce discovery adapter not yet implemented');
      default:
        throw new Error(`No discovery adapter for platform: ${platformType}`);
    }
  }

  /**
   * Get the extraction adapter for a given platform type
   */
  getExtractionAdapter(platformType: PlatformType): IExtractionAdapter {
    switch (platformType) {
      case 'shopify':
        return this.shopifyExtraction;
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
    return platformType === 'shopify';
  }
}
