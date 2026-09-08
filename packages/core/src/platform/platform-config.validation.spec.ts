import { describe, expect, it } from 'vitest';
import { validateConductCommerceConfig, validateCrystalCommerceConfig } from './platform-config.validation';

const parser = { kind: 'builtin' as const, version: 1 as const, parserType: 'default' as const };

describe('platform configuration validation', () => {
  it('accepts a scoped CrystalCommerce API configuration without storing a credential', () => {
    expect(validateCrystalCommerceConfig({ platform: 'crystal_commerce', endpoint: 'https://api.crystalcommerce.com', storeId: 'demo', credentialRef: 'CRYSTAL_DEMO', source: { kind: 'catalog-api', mode: 'category', categoryId: 'mtg-singles' }, parser, parserConfig: { parserType: 'default', settings: { profile: parser } } }).valid).toBe(true);
  });

  it('rejects CrystalCommerce credentials and unscoped source errors early', () => {
    const result = validateCrystalCommerceConfig({ platform: 'crystal_commerce', endpoint: 'http://bad.example', storeId: '', credentialRef: 'not safe!', source: { kind: 'catalog-api', mode: 'category' }, parser, parserConfig: { parserType: 'default', settings: { profile: parser } } });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.join(' ')).toMatch(/HTTPS.*credentialRef.*categoryId/i);
  });

  it('accepts the dedicated Conduct builtin parser', () => {
    expect(validateConductCommerceConfig({ platform: 'conduct_commerce', storefrontHost: 'merchant.example', currency: 'CAD', source: { kind: 'conduct-storefront-api', mode: 'search', query: 'Magic singles' }, parser: { ...parser, parserType: 'conduct' }, parserConfig: { parserType: 'conduct', settings: {} } }).valid).toBe(true);
  });
});
