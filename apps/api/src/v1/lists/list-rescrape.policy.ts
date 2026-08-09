import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Feature boundary for user-initiated card-list offer refreshes. */
@Injectable()
export class ListRescrapePolicy {
  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    // Keep the established flag name so existing launch configuration remains valid.
    const value = this.config.get<boolean | string>('CART_RESCRAPE_ENABLED', true);
    return value === true || value === 'true';
  }
}
