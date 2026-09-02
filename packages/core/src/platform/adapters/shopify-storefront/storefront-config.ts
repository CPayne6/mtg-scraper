import { validateStorefrontMappingProfileContract, validateStorefrontParserProfileGrammar } from '@scoutlgs/shared';
import type { NormalizedStorefrontConfig, StorefrontScraperConfig } from '@scoutlgs/shared';
import type { Store } from '../../../database/store.entity';

export type StorefrontConfigValidation = { valid: boolean; errors: string[]; config?: NormalizedStorefrontConfig };

/** Normalizes the Storefront API host while accepting legacy absolute HTTP(S) values. */
export function normalizeStorefrontHost(value: string | undefined, baseUrl: string): string {
  const candidate = value || baseUrl;
  if (!candidate || candidate.trim() !== candidate || /\s/.test(candidate)) throw new Error('Storefront host must not contain whitespace');
  const absolute = /^[a-z][a-z\d+.-]*:\/\//i.test(candidate);
  let parsed: URL;
  try { parsed = new URL(absolute ? candidate : `https://${candidate}`); } catch { throw new Error('Storefront host is invalid'); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('Storefront host must use HTTP(S)');
  if (parsed.username || parsed.password) throw new Error('Storefront host must not include credentials');
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error('Storefront host must not include a path, query, or fragment');
  if (!parsed.hostname) throw new Error('Storefront host is empty');
  return parsed.host.toLowerCase();
}

function validateBaseUrl(baseUrl: string, errors: string[]) {
  try { const url = new URL(baseUrl); if (!['http:', 'https:'].includes(url.protocol) || !!url.username || !!url.password || url.pathname !== '/' || !!url.search || !!url.hash) errors.push('baseUrl: expected an absolute customer-facing HTTP(S) origin'); } catch { errors.push('baseUrl: expected an absolute customer-facing HTTP(S) origin'); }
}

export function validateStorefrontStoreConfig(store: Pick<Store, 'baseUrl' | 'platformType' | 'rateLimitPerSecond' | 'scraperConfig'>): StorefrontConfigValidation {
  const errors: string[] = []; validateBaseUrl(store.baseUrl, errors);
  if (store.platformType !== 'shopify_storefront') errors.push('platformType: expected shopify_storefront');
  if (!Number.isFinite(store.rateLimitPerSecond) || store.rateLimitPerSecond <= 0) errors.push('rateLimitPerSecond: expected a positive number');
  const config = (store.scraperConfig ?? {}) as Partial<StorefrontScraperConfig>;
  let shopifyUrl = ''; try { shopifyUrl = normalizeStorefrontHost(config.shopifyUrl, store.baseUrl); } catch (error) { errors.push(`shopifyUrl: ${(error as Error).message}`); }
  if (typeof config.storefrontApiVersion !== 'string' || !/^\d{4}-\d{2}$/.test(config.storefrontApiVersion)) errors.push('storefrontApiVersion: expected YYYY-MM');
  if (typeof config.storefrontScope !== 'string' || !config.storefrontScope.trim()) errors.push('storefrontScope: required');
  if (!config.parser) errors.push('parser: required'); else { const parser = config.parser.kind === 'mapping' ? validateStorefrontMappingProfileContract(config.parser) : validateStorefrontParserProfileGrammar(config.parser); if (!parser.valid) errors.push(...parser.errors.map(error => `parser: ${error}`)); }
  return errors.length ? { valid: false, errors } : { valid: true, errors, config: { ...config, shopifyUrl } as NormalizedStorefrontConfig };
}
