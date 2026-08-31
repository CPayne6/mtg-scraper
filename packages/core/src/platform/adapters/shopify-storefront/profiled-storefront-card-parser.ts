import { Condition, evaluateStorefrontParserProfile, matchesStorefrontProfilePredicate, validateStorefrontParserProfile } from '@scoutlgs/shared';
import type { ProfileEvaluationInput, StorefrontParserProfile } from '@scoutlgs/shared';
import { isArtSeriesTitle } from '../shopify/extractors/art-series';
import type { ExtractedCardVariant } from '../../platform.interfaces';

export class InvalidStorefrontParserProfileError extends Error {
  constructor(public readonly errors: string[]) { super(`Invalid Storefront parser profile: ${errors.join('; ')}`); this.name = 'InvalidStorefrontParserProfileError'; }
}

/** Evaluates validated mapping profiles. Configuration is compiled once per store/profile JSON. */
export class ProfiledStorefrontCardParser {
  private static cache = new Map<string, StorefrontParserProfile>();
  static compile(storeUuid: string, profile: StorefrontParserProfile): Extract<StorefrontParserProfile, { kind: 'mapping' }> {
    if (profile.kind !== 'mapping') throw new InvalidStorefrontParserProfileError(['profile is not a mapping profile']);
    const key = `${storeUuid}:${stableJson(profile)}`;
    const cached = this.cache.get(key);
    if (cached) return cached as Extract<StorefrontParserProfile, { kind: 'mapping' }>;
    const validation = validateStorefrontParserProfile(profile);
    if (!validation.valid) throw new InvalidStorefrontParserProfileError(validation.errors);
    this.cache.set(key, profile); return profile;
  }
  static isArtSeries(profile: Extract<StorefrontParserProfile, { kind: 'mapping' }>, inputs: ProfileEvaluationInput[]): boolean {
    if (inputs.some(i => isArtSeriesTitle(i.product.title))) return true;
    return (profile.exclusions ?? []).some(exclusion => exclusion.reason === 'art-series' && (exclusion.scope === 'product'
      ? inputs.some(i => matchesStorefrontProfilePredicate(exclusion.predicate, i))
      : inputs.length > 0 && inputs.every(i => matchesStorefrontProfilePredicate(exclusion.predicate, i))));
  }
  static parse(profile: Extract<StorefrontParserProfile, { kind: 'mapping' }>, input: ProfileEvaluationInput, storeBaseUrl: string): ExtractedCardVariant | null {
    const fields = evaluateStorefrontParserProfile(profile, input);
    const price = Number(input.variant.price.amount);
    if (!Number.isFinite(price) || price < 0) return null;
    return {
      cardName: typeof fields.cardName === 'string' ? fields.cardName : '',
      setName: typeof fields.setName === 'string' ? fields.setName : '',
      setCode: typeof fields.setCode === 'string' ? fields.setCode : undefined,
      collectorNumber: typeof fields.collectorNumber === 'string' ? fields.collectorNumber : undefined,
      condition: (typeof fields.condition === 'string' ? fields.condition : Condition.UNKNOWN) as Condition,
      foil: fields.foil === true,
      isToken: fields.isToken === true,
      price,
      currency: input.variant.price.currencyCode,
      inStock: input.variant.availableForSale,
      imageUrl: input.product.images[0]?.url,
      productUrl: input.product.onlineStoreUrl || `${storeBaseUrl}/products/${input.product.handle}`,
      sku: input.variant.sku,
      platformVariantId: input.variant.id.split('/').pop(),
    };
  }
}
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value as Record<string,unknown>).sort().map(k => `${JSON.stringify(k)}:${stableJson((value as Record<string,unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
