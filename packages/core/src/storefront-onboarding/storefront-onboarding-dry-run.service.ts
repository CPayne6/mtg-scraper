import { Injectable } from '@nestjs/common';
import type { ExtractedCardVariant } from '../platform/platform.interfaces';
import { PrintingMatcherService, type MatchResult } from './printing-matcher.service';
import { TokenMatcherService } from './token-matcher.service';

export type OnboardingIdentityOutcome =
  | 'exact-printing'
  | 'ambiguous'
  | 'unmatched'
  | 'token'
  | 'image-mismatch'
  | 'image-unavailable';

export type OnboardingVariantEvaluation = {
  variant: ExtractedCardVariant;
  outcome: OnboardingIdentityOutcome;
  cardMatch: MatchResult;
  tokenPrintingId?: number | null;
  sourceImageUrl?: string | null;
  canonicalImageUri?: string | null;
  imageVerified?: boolean;
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
      const canonicalImageUri = await this.printingMatcher.getPrintingImageUri(
        cardMatch.cardPrintingId,
      );
      const image = imageEvidence(variant.imageUrl, canonicalImageUri);
      return {
        variant,
        outcome: image.imageVerified ? 'exact-printing' : image.failureOutcome!,
        cardMatch,
        ...image,
        ...(image.imageVerified
          ? { prospectiveListing: prospectiveListing(variant, cardMatch) }
          : {}),
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
        const canonicalImageUri = await this.tokenMatcher.getPrintingImageUri(
          tokenMatch.tokenPrintingId,
        );
        const image = imageEvidence(variant.imageUrl, canonicalImageUri);
        return {
          variant,
          outcome: image.imageVerified ? 'token' : image.failureOutcome!,
          cardMatch,
          tokenPrintingId: tokenMatch.tokenPrintingId,
          ...image,
        };
      }
    }
    return { variant, outcome: 'unmatched', cardMatch };
  }
}

function imageEvidence(
  sourceImageUrl: string | undefined,
  canonicalImageUri: string | null,
): Pick<
  OnboardingVariantEvaluation,
  'sourceImageUrl' | 'canonicalImageUri' | 'imageVerified'
> & { failureOutcome?: 'image-mismatch' | 'image-unavailable' } {
  if (!sourceImageUrl || !canonicalImageUri)
    return {
      sourceImageUrl: sourceImageUrl ?? null,
      canonicalImageUri,
      imageVerified: false,
      failureOutcome: 'image-unavailable',
    };
  return {
    sourceImageUrl,
    canonicalImageUri,
    imageVerified: sourceImageUrl === canonicalImageUri,
    failureOutcome:
      sourceImageUrl === canonicalImageUri
        ? undefined
        : 'image-mismatch',
  };
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
