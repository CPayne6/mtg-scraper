import {
  validateStorefrontMappingProfileContract,
  validateStorefrontParserProfileGrammar,
} from '@scoutlgs/shared';
import type {
  ConductCommerceConfig,
  CrystalCommerceConfig,
  StoreParserConfig,
  StorefrontParserProfile,
  StoreScraperConfig,
} from '@scoutlgs/shared';
import type { Store } from '../database/store.entity';
import { validateStorefrontStoreConfig } from './adapters/shopify-storefront/storefront-config';

export type PlatformConfigValidation =
  | { valid: true; errors: []; config: StoreScraperConfig }
  | { valid: false; errors: string[] };

function endpoint(value: unknown, errors: string[]) {
  if (typeof value !== 'string' || !value.trim()) {
    errors.push('endpoint: required'); return;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
      throw new Error();
  } catch { errors.push('endpoint: expected an absolute HTTPS URL without credentials'); }
}

function parser(value: any, errors: string[]) {
  if (!value) { errors.push('parser: required'); return; }
  const result = value.kind === 'mapping'
    ? validateStorefrontMappingProfileContract(value)
    : validateStorefrontParserProfileGrammar(value);
  if (!result.valid) errors.push(...result.errors.map((error) => `parser: ${error}`));
}

/**
 * New configurations carry a discriminated parser config in addition to the
 * profile used by legacy storefront rows.  The duplicate parser type is
 * deliberate: it prevents a store from declaring (for example) a BinderPOS
 * parser while supplying Default parser settings.  Missing parserConfig is
 * accepted only for pre-existing Shopify rows during their gradual migration.
 */
export function validateParserConfig(
  value: unknown,
  profile: unknown,
  errors: string[],
  required = false,
) {
  if (!value) {
    if (required) errors.push('parserConfig: required');
    return;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push('parserConfig: expected an object');
    return;
  }
  const config = value as Partial<StoreParserConfig>;
  if (typeof config.parserType !== 'string' || !config.settings || typeof config.settings !== 'object' || Array.isArray(config.settings)) {
    errors.push('parserConfig: expected a parserType and settings object');
    return;
  }
  if (config.parserType === 'conduct') {
    if (Object.keys(config.settings).length) errors.push('parserConfig.settings: conduct currently accepts no settings');
  } else {
    const settings = config.settings as { profile?: StorefrontParserProfile };
    if (!settings.profile) errors.push('parserConfig.settings.profile: required');
    else {
      parser(settings.profile, errors);
      if (settings.profile.kind === 'builtin' && settings.profile.parserType !== config.parserType)
        errors.push('parserConfig: parserType must match settings.profile.parserType');
      if (settings.profile.kind === 'mapping' && config.parserType !== 'mapping')
        errors.push('parserConfig: mapping profile requires parserType mapping');
    }
  }
  if (profile && typeof profile === 'object') {
    const selected = profile as StorefrontParserProfile;
    const configured = (config.settings as { profile?: StorefrontParserProfile }).profile;
    if (configured && JSON.stringify(selected) !== JSON.stringify(configured))
      errors.push('parserConfig: settings.profile must match parser');
    if (selected.kind === 'builtin' && selected.parserType !== config.parserType)
      errors.push('parserConfig: parserType must match parser.parserType');
    if (selected.kind === 'mapping' && config.parserType !== 'mapping')
      errors.push('parserConfig: mapping parser requires parserType mapping');
  }
}

export function validateCrystalCommerceConfig(config: unknown): PlatformConfigValidation {
  const value = (config ?? {}) as Partial<CrystalCommerceConfig>;
  const errors: string[] = [];
  if (value.platform !== 'crystal_commerce') errors.push('platform: expected crystal_commerce');
  endpoint(value.endpoint, errors);
  if (typeof value.storeId !== 'string' || !value.storeId.trim()) errors.push('storeId: required');
  if (typeof value.credentialRef !== 'string' || !/^[A-Za-z0-9_.:/-]+$/.test(value.credentialRef))
    errors.push('credentialRef: required (a secret reference, not a token)');
  const source = value.source;
  if (!source || source.kind !== 'catalog-api') errors.push('source.kind: expected catalog-api');
  else if (!['category', 'search', 'all-products'].includes(source.mode)) errors.push('source.mode: invalid');
  else if (source.mode === 'category' && !source.categoryId?.trim()) errors.push('source.categoryId: required for category mode');
  else if (source.mode === 'search' && !source.query?.trim()) errors.push('source.query: required for search mode');
  parser(value.parser, errors);
  validateParserConfig(value.parserConfig, value.parser, errors, true);
  return errors.length ? { valid: false, errors } : { valid: true, errors: [], config: value as CrystalCommerceConfig };
}

export function validateConductCommerceConfig(config: unknown): PlatformConfigValidation {
  const value = (config ?? {}) as Partial<ConductCommerceConfig>;
  const errors: string[] = [];
  if (value.platform !== 'conduct_commerce') errors.push('platform: expected conduct_commerce');
  if (typeof value.storefrontHost !== 'string' || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(value.storefrontHost) || value.storefrontHost.includes('..'))
    errors.push('storefrontHost: expected a hostname without a protocol or path');
  if (typeof value.currency !== 'string' || !/^[A-Z]{3}$/.test(value.currency))
    errors.push('currency: expected an ISO-4217 code');
  const source = value.source;
  if (!source || source.kind !== 'conduct-storefront-api') errors.push('source.kind: expected conduct-storefront-api');
  else if (!['magic-product-type', 'category', 'search'].includes(source.mode)) errors.push('source.mode: invalid');
  else if (source.mode === 'magic-product-type' && (!Number.isInteger(source.productTypeId) || source.productTypeId! < 1)) errors.push('source.productTypeId: required for magic-product-type mode');
  else if (source.mode === 'category' && !source.categoryName?.trim()) errors.push('source.categoryName: required for category mode');
  else if (source.mode === 'search' && !source.query?.trim()) errors.push('source.query: required for search mode');
  parser(value.parser, errors);
  // The Conduct adapter currently has one production parser, driven by its
  // explicit Set/Collector Number fields and title conventions.  Reject a
  // mapping profile rather than accepting configuration we would ignore.
  if (value.parser?.kind !== 'builtin' || value.parser?.parserType !== 'conduct')
    errors.push('parser: Conduct Commerce requires builtin conduct');
  validateParserConfig(value.parserConfig, value.parser, errors, true);
  return errors.length ? { valid: false, errors } : { valid: true, errors: [], config: value as ConductCommerceConfig };
}

/** Single validation boundary for write paths and future onboarding probes. */
export function validatePlatformStoreConfig(store: Pick<Store, 'platformType' | 'baseUrl' | 'rateLimitPerSecond' | 'scraperConfig'>): PlatformConfigValidation {
  if (store.platformType === 'shopify_storefront') {
    const result = validateStorefrontStoreConfig(store as Store);
    return result.valid
      ? { valid: true, errors: [], config: result.config! }
      : { valid: false, errors: result.errors };
  }
  if (store.platformType === 'crystal_commerce') return validateCrystalCommerceConfig(store.scraperConfig);
  if (store.platformType === 'conduct_commerce') return validateConductCommerceConfig(store.scraperConfig);
  return { valid: false, errors: ['platformType: unsupported or missing'] };
}
