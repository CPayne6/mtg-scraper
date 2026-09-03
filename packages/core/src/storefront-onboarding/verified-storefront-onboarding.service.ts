import {
  normalizeStorefrontMappingProfileDraft,
  validateStorefrontMappingProfileContract,
} from '@scoutlgs/shared';
import type { ExtractedCardVariant } from '../platform/platform.interfaces';

export type OnboardingProduct = any;
export type OnboardingScope = {
  ok: boolean;
  query: string | null;
  strategy: string;
  source: 'manual' | 'inferred';
  warnings: string[];
  productCount?: number;
  variantCount?: number;
  evidence?: Record<string, unknown>;
};
export type OnboardingParser = {
  validate(profile: unknown): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  };
  dryRun(
    profile: unknown,
    products: OnboardingProduct[],
    scope: OnboardingScope,
  ): any;
};
export type VerifiedStorefrontOnboardingDependencies = {
  storefront: {
    homepage(url: URL, timeoutMs: number): Promise<any>;
    products(
      url: URL,
      apiVersion: string,
      scope: string | null,
      timeoutMs: number,
      first?: number,
    ): Promise<{
      ok: boolean;
      products: OnboardingProduct[];
      error?: string | null;
    }>;
  };
  parser: OnboardingParser;
  identity: {
    evaluate(
      variants: Array<{
        productId: string;
        variantId: string;
        variant: ExtractedCardVariant;
      }>,
    ): Promise<Array<{ outcome: string }>>;
  };
  ai?: {
    discover(input: {
      evidence: unknown;
      correctiveErrors?: string[];
      timeoutMs: number;
    }): Promise<
      | { kind: 'success'; content: string; provider?: string; model?: string }
      | { kind: 'transport-error'; status?: number; reason: string; transient?: boolean }
    >;
  };
};

const productVariants = (product: any) =>
  product.variants?.nodes ??
  product.variants?.edges?.map((edge: any) => edge.node) ??
  [];
const quote = (value: string) =>
  `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const norm = (value: unknown) =>
  String(value ?? '').replace(/[_\s:-]+/g, '').toLowerCase();
const isMtg = (value: unknown) =>
  /(?:^|brands)(mtg|magic|magicthegathering|magicthgathering)$/.test(
    norm(value),
  );
const tags = (product: any): string[] =>
  Array.isArray(product.tags)
    ? product.tags
    : String(product.tags ?? '')
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);

export function inferStorefrontScopes(products: OnboardingProduct[]): OnboardingScope[] {
  const productType = products
    .map((product) => product.productType ?? product.product_type)
    .find((value: any) => /single/i.test(String(value)));
  const mtgTag = products.flatMap(tags).find(isMtg);
  const out: OnboardingScope[] = [];
  // Hobbiesville exposes `Single` plus `Brands_Magicthegathering`; this is more
  // precise than either field alone and must win over vendor-only candidates.
  if (productType && mtgTag)
    out.push({
      ok: false,
      query: `product_type:${String(productType)} tag:${mtgTag}`,
      strategy: 'combined-mtg-product-type-tag',
      source: 'inferred',
      warnings: [],
    });
  if (productType) out.push({ ok: false, query: `product_type:${quote(String(productType))}`, strategy: 'mtg-product-type', source: 'inferred', warnings: [] });
  if (mtgTag) out.push({ ok: false, query: `product_type:"Single" tag:${quote(mtgTag)}`, strategy: 'mtg-tag', source: 'inferred', warnings: [] });
  return out;
}

export function deterministicVariantSample(products: OnboardingProduct[], fraction = .2, minimum = 100): OnboardingProduct[] {
  const all = products.flatMap(p => productVariants(p).map((v: any) => ({ p, v })));
  const take = Math.max(minimum, Math.ceil(all.length * fraction));
  if (all.length < minimum) return [];
  const selected = all.sort((a, b) => stable(`${a.p.id}:${a.v.id}`).localeCompare(stable(`${b.p.id}:${b.v.id}`))).slice(0, take);
  const byProduct = new Map<any, any[]>();
  for (const { p, v } of selected) byProduct.set(p.id, [...(byProduct.get(p.id) ?? []), v]);
  return products.filter(p => byProduct.has(p.id)).map(p => ({ ...p, variants: { ...p.variants, nodes: byProduct.get(p.id) } }));
}
function stable(value: string) { let h = 2166136261; for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619); return (h >>> 0).toString(16).padStart(8, '0'); }

export class VerifiedStorefrontOnboardingService {
  constructor(private readonly deps: VerifiedStorefrontOnboardingDependencies) {}
  async onboard(input: { url: string; proposedSlug?: string; scope?: string; parserProfile?: unknown; aiDiscovery?: boolean; timeoutMs?: number; apiVersion?: string }) {
    const url = new URL(input.url); url.pathname = '/'; url.search = ''; url.hash = '';
    const timeoutMs = input.timeoutMs ?? 30_000, apiVersion = input.apiVersion ?? '2026-04';
    const homepage = await this.deps.storefront.homepage(url, timeoutMs);
    const initial = await this.deps.storefront.products(url, apiVersion, null, timeoutMs, 250);
    if (!initial.ok) return this.report('failed', url, apiVersion, homepage, { ok: false, query: null, strategy: 'unavailable', source: 'inferred', warnings: [initial.error ?? 'catalog unavailable'] });
    const candidates = input.scope ? [{ query: input.scope, strategy: 'manual', source: 'manual' as const, warnings: [] }] : inferStorefrontScopes(initial.products);
    let scope: OnboardingScope | undefined; let scoped: OnboardingProduct[] = [];
    for (const candidate of candidates) {
      const result = await this.deps.storefront.products(url, apiVersion, candidate.query, timeoutMs, 250);
      const products = result.products ?? []; const variants = products.reduce((n, p) => n + productVariants(p).length, 0);
      const contaminated = products.some(p => !/single/i.test(String(p.productType ?? p.product_type ?? '')) || !(/magic|mtg/i.test(`${p.productType ?? ''} ${tags(p).join(' ')}`)));
      const assessed = { ...candidate, ok: result.ok && products.length > 0 && !contaminated, productCount: products.length, variantCount: variants, warnings: result.ok && products.length && !contaminated ? [] : ['unsafe, empty, or mixed catalogue scope'] };
      scope ??= assessed; if (assessed.ok) { scope = assessed; scoped = products; break; }
    }
    if (!scope?.ok) return this.report('rejected', url, apiVersion, homepage, scope ?? { ok: false, query: null, strategy: 'none', source: 'inferred', warnings: ['no safe scope'] });
    const totalVariants = scoped.reduce((n, p) => n + productVariants(p).length, 0);
    const sampled = deterministicVariantSample(scoped);
    if (!sampled.length) return this.report('rejected', url, apiVersion, homepage, scope, null, { errors: ['scoped catalog has fewer than 100 variants'] }, { totalScopeVariants: totalVariants, sampledVariants: 0, sampleFraction: .2 });
    let profile = input.parserProfile; let ai: any = { status: 'not-called' };
    if (!profile && homepage?.signals?.binderScript && homepage?.signals?.binderInventory) profile = { kind: 'builtin', version: 1, parserType: 'binderpos' };
    if (!profile && input.aiDiscovery && this.deps.ai) ai = await this.discover(scoped, timeoutMs), profile = ai.envelope?.parserProfile;
    const validation = profile ? this.deps.parser.dryRun(profile, sampled, scope) : { valid: false, errors: ['no parser profile'] };
    const identity = validation.valid ? await this.deps.identity.evaluate(validation.parsedVariants ?? []) : [];
    const failedIdentity = identity.filter(x => x.outcome !== 'exact-printing' && x.outcome !== 'token');
    const valid = validation.valid && identity.length >= 100 && !failedIdentity.length;
    const diagnostics = { totalScopeVariants: totalVariants, sampledVariants: sampled.reduce((n, p) => n + productVariants(p).length, 0), sampleFraction: .2, identity: { counts: identity.reduce((a: any, x) => ((a[x.outcome] = (a[x.outcome] ?? 0) + 1), a), {}), failures: failedIdentity.length } };
    return this.report(valid ? 'proposal-ready' : 'rejected', url, apiVersion, homepage, scope, profile, validation, { ...ai, ...diagnostics }, input.proposedSlug);
  }
  private async discover(products: any[], timeoutMs: number) {
    const response = await this.deps.ai!.discover({ evidence: { products: products.slice(0, 5).map(p => ({ title: p.title, variants: productVariants(p).slice(0, 3) })) }, timeoutMs });
    if (response.kind !== 'success') return { status: 'provider-failed', transportStatus: response.status, error: response.reason };
    try { const envelope = JSON.parse(response.content); if (envelope?.parserProfile) envelope.parserProfile = normalizeStorefrontMappingProfileDraft(envelope.parserProfile); const check = validateStorefrontMappingProfileContract(envelope?.parserProfile); return check.valid && envelope?.requiresHumanReview === true ? { status: 'drafted', envelope, provider: response.provider, model: response.model } : { status: 'invalid-output', errors: check.errors }; } catch { return { status: 'malformed-output' }; }
  }
  private report(status: string, url: URL, apiVersion: string, homepage: any, scope: OnboardingScope, profile?: any, validation?: any, diagnostics?: any, requestedSlug?: string) {
    const displayName = url.hostname.replace(/^www\./, ''); const name = requestedSlug ?? displayName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
    return { status, probeOnly: true, approvalRequired: true, input: { url: url.toString(), proposedSlug: requestedSlug }, detection: { homepage, endpointHost: url.host, apiVersion }, scope, validation, diagnostics, proposedStore: status === 'proposal-ready' ? { name, displayName, baseUrl: url.origin, isActive: false, platformType: 'shopify_storefront', scraperType: profile.kind === 'builtin' ? 'binderpos' : 'default', rateLimitPerSecond: 15, discoveryConfig: { discoveryEnabled: false }, scraperConfig: { shopifyUrl: url.host, storefrontApiVersion: apiVersion, source: { kind: 'storefront-graphql', mode: 'products-query', productQuery: scope.query }, storefrontScope: scope.query, parser: profile } } : null };
  }
}
