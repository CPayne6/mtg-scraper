import { Condition, evaluateStorefrontParserProfile, matchesStorefrontProfilePredicate, validateStorefrontMappingProfileContract } from '@scoutlgs/shared';
import type { ProfileEvaluationInput, StorefrontParserProfile } from '@scoutlgs/shared';
import { isArtSeriesTitle } from '../shopify/extractors/art-series';
import type { ExtractedCardVariant } from '../../platform.interfaces';

export class InvalidStorefrontParserProfileError extends Error {
  constructor(public readonly errors: string[]) { super(`Invalid Storefront parser profile: ${errors.join('; ')}`); this.name = 'InvalidStorefrontParserProfileError'; }
}
export type ProfileParseFailureCode = 'missing-card-name' | 'missing-set-identity' | 'unknown-condition' | 'unknown-finish' | 'invalid-price' | 'missing-currency' | 'missing-variant-id';
export type ProfileParseResult = { ok: true; variant: ExtractedCardVariant } | { ok: false; variantId?: string; failures: Array<{ code: ProfileParseFailureCode; field: string }> };

/** Evaluates validated mapping profiles. Configuration is compiled once per store/profile JSON. */
export class ProfiledStorefrontCardParser {
  private static cache = new Map<string, StorefrontParserProfile>();
  static compile(storeUuid: string, profile: StorefrontParserProfile): Extract<StorefrontParserProfile, { kind: 'mapping' }> {
    if (profile.kind !== 'mapping') throw new InvalidStorefrontParserProfileError(['profile is not a mapping profile']);
    const key = `${storeUuid}:${stableJson(profile)}`;
    const cached = this.cache.get(key);
    if (cached) return cached as Extract<StorefrontParserProfile, { kind: 'mapping' }>;
    const validation = validateStorefrontMappingProfileContract(profile);
    if (!validation.valid) throw new InvalidStorefrontParserProfileError(validation.errors);
    this.cache.set(key, profile); return profile;
  }
  static isArtSeries(profile: Extract<StorefrontParserProfile, { kind: 'mapping' }>, inputs: ProfileEvaluationInput[]): boolean {
    if (inputs.some(i => isArtSeriesTitle(i.product.title))) return true;
    return (profile.exclusions ?? []).some(exclusion => exclusion.reason === 'art-series' && (exclusion.scope === 'product'
      ? inputs.some(i => matchesStorefrontProfilePredicate(exclusion.predicate, i))
      : inputs.length > 0 && inputs.every(i => matchesStorefrontProfilePredicate(exclusion.predicate, i))));
  }
  static parse(profile: Extract<StorefrontParserProfile, { kind: 'mapping' }>, input: ProfileEvaluationInput, storeBaseUrl: string): ProfileParseResult {
    const fields = evaluateStorefrontParserProfile(profile, input);
    const price = Number(input.variant.price.amount);
    const failures: Array<{ code: ProfileParseFailureCode; field: string }> = [];
    const cardName = typeof fields.cardName === 'string' ? fields.cardName.trim() : '';
    const setName = typeof fields.setName === 'string' ? fields.setName.trim() : '';
    const setCode = typeof fields.setCode === 'string' ? fields.setCode.trim() : undefined;
    const condition = typeof fields.condition === 'string' ? fields.condition : undefined;
    const variantId = input.variant.id.split('/').pop();
    if (!cardName) failures.push({ code: 'missing-card-name', field: 'cardName' });
    if (!setName && !setCode) failures.push({ code: 'missing-set-identity', field: 'setName|setCode' });
    if (!condition || condition === Condition.UNKNOWN) failures.push({ code: 'unknown-condition', field: 'condition' });
    if (typeof fields.foil !== 'boolean') failures.push({ code: 'unknown-finish', field: 'foil' });
    if (!Number.isFinite(price) || price < 0) failures.push({ code: 'invalid-price', field: 'price' });
    if (!input.variant.price.currencyCode?.trim()) failures.push({ code: 'missing-currency', field: 'currency' });
    if (!variantId) failures.push({ code: 'missing-variant-id', field: 'platformVariantId' });
    if (failures.length) return { ok: false, ...(variantId ? { variantId } : {}), failures };
    return { ok: true, variant: {
      cardName,
      setName,
      setCode: typeof fields.setCode === 'string' ? fields.setCode : undefined,
      collectorNumber: typeof fields.collectorNumber === 'string' ? fields.collectorNumber : undefined,
      condition: condition as Condition,
      foil: fields.foil as boolean,
      isToken: fields.isToken === true,
      price,
      currency: input.variant.price.currencyCode,
      inStock: input.variant.availableForSale,
      imageUrl: input.product.images[0]?.url,
      productUrl: input.product.onlineStoreUrl || `${storeBaseUrl}/products/${input.product.handle}`,
      sku: input.variant.sku,
      platformVariantId: variantId,
    } };
  }
}
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value as Record<string,unknown>).sort().map(k => `${JSON.stringify(k)}:${stableJson((value as Record<string,unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
