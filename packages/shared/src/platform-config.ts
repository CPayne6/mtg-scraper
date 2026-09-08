import type { StorefrontParserProfile } from './storefront-parser-profile';

/** A parser is intentionally independent from the catalogue transport. */
export type BuiltinOrMappingParserProfile = StorefrontParserProfile;

/**
 * Parser selection is independent of catalogue transport. `settings` is the
 * parser-specific configuration (rather than an ambiguous `payload`): its
 * shape is narrowed by `parserType` before an adapter uses it.
 */
type BuiltinProfile<T extends string> = { kind: 'builtin'; version: 1; parserType: T };
export type DefaultParserConfig = { parserType: 'default'; settings: { profile: BuiltinProfile<'default'> } };
export type BinderposParserConfig = { parserType: 'binderpos'; settings: { profile: BuiltinProfile<'binderpos'> } };
export type F2fParserConfig = { parserType: 'f2f'; settings: { profile: BuiltinProfile<'f2f'> } };
export type _401ParserConfig = { parserType: '401'; settings: { profile: BuiltinProfile<'401'> } };
export type HobbiesParserConfig = { parserType: 'hobbies'; settings: { profile: BuiltinProfile<'hobbies'> } };
export type CgRealmParserConfig = { parserType: 'cgrealm'; settings: { profile: BuiltinProfile<'cgrealm'> } };
export type MappingParserConfig = { parserType: 'mapping'; settings: { profile: Extract<StorefrontParserProfile, { kind: 'mapping' }> } };
/** Conduct has no merchant-specific parser fields yet; empty settings are
 * intentional and makes later Conduct parser settings a typed addition. */
export type ConductParserConfig = { parserType: 'conduct'; settings: Record<never, never> };
export type StoreParserConfig = DefaultParserConfig | BinderposParserConfig | F2fParserConfig | _401ParserConfig | HobbiesParserConfig | CgRealmParserConfig | MappingParserConfig | ConductParserConfig;
export type StoreParserType = StoreParserConfig['parserType'];

export type CrystalCommerceSource = {
  kind: 'catalog-api';
  mode: 'category' | 'search' | 'all-products';
  categoryId?: string;
  query?: string;
};

/**
 * Crystal's per-store inventory API is authenticated.  `credentialRef` is a
 * reference to a secret held by the deployment, never the secret itself.
 */
export type CrystalCommerceConfig = {
  platform: 'crystal_commerce';
  endpoint: string;
  storeId: string;
  credentialRef: string;
  source: CrystalCommerceSource;
  parser: BuiltinOrMappingParserProfile;
  parserConfig: Exclude<StoreParserConfig, ConductParserConfig>;
};

export type ConductCommerceSource = {
  kind: 'conduct-storefront-api';
  mode: 'magic-product-type' | 'category' | 'search';
  productTypeId?: number;
  categoryName?: string;
  query?: string;
};

export type ConductCommerceConfig = {
  platform: 'conduct_commerce';
  /** Customer-facing Conduct storefront domain; it is the API tenant key. */
  storefrontHost: string;
  /** ISO-4217 currency; Conduct's tested public responses do not include it. */
  currency: string;
  source: ConductCommerceSource;
  parser: BuiltinOrMappingParserProfile;
  parserConfig: ConductParserConfig;
};

export type StoreScraperConfig =
  | (import('./storefront-parser-profile').StorefrontScraperConfig & {
      /** Optional only for legacy Shopify rows; new onboarding writes it. */
      parserConfig?: Exclude<StoreParserConfig, ConductParserConfig>;
    })
  | CrystalCommerceConfig
  | ConductCommerceConfig;
