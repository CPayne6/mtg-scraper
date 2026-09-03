import { Injectable } from '@nestjs/common';
import {
  StorefrontOnboardingDryRunService,
  type ExtractedCardVariant,
} from '@scoutlgs/core';

export type ParsedStorefrontVariant = {
  productId: string;
  variantId: string;
  variant: ExtractedCardVariant;
};

/**
 * API-facing adapter for the read-only production identity gate. It performs
 * no persistence: callers persist its report only after every variant has
 * passed exact database and image-URL verification.
 */
@Injectable()
export class StorefrontOnboardingIdentityService {
  constructor(private readonly dryRun: StorefrontOnboardingDryRunService) {}

  async evaluate(variants: ParsedStorefrontVariant[]) {
    const results = await this.dryRun.evaluate(variants.map(({ variant }) => variant));
    return results.map((result, index) => ({
      productId: variants[index].productId,
      variantId: variants[index].variantId,
      outcome: result.outcome,
      cardPrintingId: result.cardMatch.cardPrintingId,
      cardNameId: result.cardMatch.cardNameId,
      tokenPrintingId: result.tokenPrintingId ?? null,
      sourceImageUrl: result.sourceImageUrl ?? null,
      canonicalImageUri: result.canonicalImageUri ?? null,
      imageVerified: result.imageVerified ?? false,
      match: result.cardMatch,
    }));
  }
}
