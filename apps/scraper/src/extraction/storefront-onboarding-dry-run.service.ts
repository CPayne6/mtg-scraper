import { Injectable } from '@nestjs/common';
import type { ExtractedCardVariant } from '@scoutlgs/core';
import { PrintingMatcherService, type MatchResult } from './printing-matcher.service';
import { TokenMatcherService } from './token-matcher.service';

export type OnboardingIdentityOutcome =
  | 'exact-printing'
  | 'ambiguous'
  | 'unmatched'
  | 'token';

export type OnboardingVariantEvaluation = {
  variant: ExtractedCardVariant;
  outcome: OnboardingIdentityOutcome;
  cardMatch: MatchResult;
  tokenPrintingId?: number | null;
  prospectiveListing?: {
    cardPrintingId: number | null;
    cardNameId: number | null;
    rawTitle: string;
    currency: string;
    condition: ExtractedCardVariant['condition'];
    foil: boolean;
    price: number;
    platformVariantId?: string;
  };
};

/**
 * The read-only identity/listing portion of production extraction. It contains
 * no repositories, accumulators, upserts, queue calls, or Store mutations.
 */
@Injectable()
export class StorefrontOnboardingDryRunService {
  constructor(
    private readonly printingMatcher: PrintingMatcherService,
    private readonly tokenMatcher: TokenMatcherService,
  ) {}

  async evaluate(
    variants: ExtractedCardVariant[],
  ): Promise<OnboardingVariantEvaluation[]> {
    return Promise.all(variants.map((variant) => this.evaluateVariant(variant)));
  }

  private async evaluateVariant(
    variant: ExtractedCardVariant,
  ): Promise<OnboardingVariantEvaluation> {
    const cardMatch = await this.printingMatcher.match(
      variant.cardName,
      variant.setCode,
      variant.collectorNumber,
      variant.setName,
    );
    if (cardMatch.cardPrintingId) {
      return {
        variant,
        outcome: 'exact-printing',
        cardMatch,
        prospectiveListing: prospectiveListing(variant, cardMatch),
      };
    }
    if (cardMatch.printingMatch === 'ambiguous')
      return { variant, outcome: 'ambiguous', cardMatch };

    // Production extraction is card-first. Only an unresolved card is allowed
    // to fall through to token matching; a parser hint alone never reroutes it.
    if (cardMatch.confidence === 'none') {
      const tokenMatch = await this.tokenMatcher.match(
        variant.cardName,
        variant.setCode,
        variant.collectorNumber,
        variant.setName,
      );
      if (tokenMatch.tokenPrintingId) {
        return {
          variant,
          outcome: 'token',
          cardMatch,
          tokenPrintingId: tokenMatch.tokenPrintingId,
        };
      }
    }
    return { variant, outcome: 'unmatched', cardMatch };
  }
}

function prospectiveListing(
  variant: ExtractedCardVariant,
  match: MatchResult,
): NonNullable<OnboardingVariantEvaluation['prospectiveListing']> {
  return {
    cardPrintingId: match.cardPrintingId,
    cardNameId: match.cardNameId,
    rawTitle: variant.cardName,
    currency: variant.currency,
    condition: variant.condition,
    foil: variant.foil,
    price: variant.price,
    platformVariantId: variant.platformVariantId,
  };
}
