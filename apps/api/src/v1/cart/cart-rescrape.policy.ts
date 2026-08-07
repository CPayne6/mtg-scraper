import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Feature boundary for user-initiated cart re-scrapes. */
@Injectable()
export class CartRescrapePolicy {
  constructor(private readonly config: ConfigService) {}
  isEnabled(): boolean {
    const value = this.config.get<boolean | string>('CART_RESCRAPE_ENABLED', true);
    return value === true || value === 'true';
  }
}
