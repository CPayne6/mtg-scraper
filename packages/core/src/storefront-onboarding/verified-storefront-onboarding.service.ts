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
    productsByTitle?(
      url: URL,
      apiVersion: string,
      title: string,
      timeoutMs: number,
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
    ): Promise<
      Array<{
        productId?: string;
        variantId?: string;
        outcome: string;
        sourceImageUrl?: string | null;
        canonicalImageUri?: string | null;
        match?: unknown;
      }>
    >;
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
    discoverScope?(input: {
      anchors: Array<{ title: string; products: OnboardingProduct[] }>;
      timeoutMs: number;
    }): Promise<{ kind: 'success'; content: string } | { kind: 'transport-error'; reason: string }>;
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

const MTG_ANCHOR_TITLES = [
  'Lightning Bolt',
  'Sol Ring',
  'Ragavan',
  'Swords to Plowshares',
  'Counterspell',
  'Birds of Paradise',
  'Command Tower',
  'Arcane Signet',
] as const;

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
    const initial = await this.deps.storefront.products(
      url,
      apiVersion,
      null,
      timeoutMs,
      250,
    );
    if (!initial.ok) return this.report('failed', url, apiVersion, homepage, { ok: false, query: null, strategy: 'unavailable', source: 'inferred', warnings: [initial.error ?? 'catalog unavailable'] });
    const anchors = await this.collectAnchorProducts(
      url,
      apiVersion,
      timeoutMs,
    );
    const discoveryProducts = anchors.products.length
      ? anchors.products
      : initial.products;
    const aiScopeCandidates = !input.scope && input.aiDiscovery
      ? await this.discoverScope(anchors.observations, timeoutMs)
      : [];
    const candidates = input.scope
      ? [
          {
            query: input.scope,
            strategy: 'manual',
            source: 'manual' as const,
            warnings: [],
          },
        ]
      : aiScopeCandidates.length
        ? aiScopeCandidates
        : inferStorefrontScopes(discoveryProducts);
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
    profile = enrichMtgSkuProfile(profile, sampled);
    const validation = profile ? this.deps.parser.dryRun(profile, sampled, scope) : { valid: false, errors: ['no parser profile'] };
    const identity = validation.valid ? await this.deps.identity.evaluate(validation.parsedVariants ?? []) : [];
    const failedIdentity = identity.filter(x => x.outcome !== 'exact-printing' && x.outcome !== 'token');
    const valid = validation.valid && identity.length >= 100 && !failedIdentity.length;
    const diagnostics = {
      totalScopeVariants: totalVariants,
      sampledVariants: sampled.reduce(
        (count, product) => count + productVariants(product).length,
        0,
      ),
      sampleFraction: 0.2,
      identity: {
        counts: identity.reduce(
          (counts: Record<string, number>, result) => ({
            ...counts,
            [result.outcome]: (counts[result.outcome] ?? 0) + 1,
          }),
          {},
        ),
        failures: failedIdentity.length,
        failureDetails: failedIdentity.slice(0, 20).map(
          ({
            productId,
            variantId,
            outcome,
            sourceImageUrl,
            canonicalImageUri,
            match,
          }) => ({
            productId,
            variantId,
            outcome,
            sourceImageUrl: sourceImageUrl ?? null,
            canonicalImageUri: canonicalImageUri ?? null,
            match: match ?? null,
          }),
        ),
      },
    };
    return this.report(valid ? 'proposal-ready' : 'rejected', url, apiVersion, homepage, scope, profile, validation, { ...ai, ...diagnostics }, input.proposedSlug);
  }

  private async collectAnchorProducts(
    url: URL,
    apiVersion: string,
    timeoutMs: number,
  ): Promise<{ products: OnboardingProduct[]; observations: Array<{ title: string; products: OnboardingProduct[] }> }> {
    if (!this.deps.storefront.productsByTitle)
      return { products: [], observations: [] };
    const observations = await Promise.all(
      MTG_ANCHOR_TITLES.map((title) =>
        this.deps.storefront.productsByTitle!(
          url,
          apiVersion,
          title,
          timeoutMs,
        ),
      ),
    );
    const seen = new Set<string>();
    const grouped = observations.map((observation, index) => ({
      title: MTG_ANCHOR_TITLES[index],
      products: observation.products,
    }));
    return {
      observations: grouped,
      products: grouped.flatMap((observation) =>
        observation.products.filter((product) => {
        const id = String(product.id ?? '');
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
        }),
      ),
    };
  }

  private async discoverScope(
    anchors: Array<{ title: string; products: OnboardingProduct[] }>,
    timeoutMs: number,
  ): Promise<OnboardingScope[]> {
    if (!this.deps.ai?.discoverScope || !anchors.length) return [];
    const response = await this.deps.ai.discoverScope({ anchors, timeoutMs });
    if (response.kind !== 'success') return [];
    try {
      const candidates = JSON.parse(response.content)?.candidates;
      if (!Array.isArray(candidates)) return [];
      return candidates.flatMap((candidate) => {
        const selectors = candidate?.selectors;
        if (!Array.isArray(selectors) || !selectors.length) return [];
        const terms = selectors.map((selector: any) => {
          if (!['productType', 'tag', 'vendor'].includes(selector?.field)) return null;
          if (typeof selector.value !== 'string' || !selector.value) return null;
          const matches = anchors.filter(({ products }) => products.some((product) =>
            selector.field === 'tag'
              ? tags(product).includes(selector.value)
              : product[selector.field] === selector.value,
          )).length;
          if (matches < 2) return null;
          const field = selector.field === 'productType' ? 'product_type' : selector.field;
          return `${field}:${quote(selector.value)}`;
        });
        return terms.every(Boolean)
          ? [{ ok: false, query: terms.join(' '), strategy: 'ai-anchor-selectors', source: 'inferred' as const, warnings: [] }]
          : [];
      });
    } catch {
      return [];
    }
  }
  private async discover(products: any[], timeoutMs: number) {
    const response = await this.deps.ai!.discover({
      evidence: compactStorefrontEvidence(products),
      timeoutMs,
    });
    if (response.kind !== 'success') return { status: 'provider-failed', transportStatus: response.status, error: response.reason };
    try {
      const envelope = JSON.parse(response.content);
      const compiled = compileParserDraftAst(envelope);
      envelope.parserProfile = compiled.profile;
      if (envelope?.parserProfile)
        envelope.parserProfile = normalizeStorefrontMappingProfileDraft(
          envelope.parserProfile,
        );
      const check = validateStorefrontMappingProfileContract(
        envelope?.parserProfile,
      );
      return check.valid && envelope?.requiresHumanReview === true
        ? { status: 'drafted', envelope, provider: response.provider, model: response.model }
        : {
            status: 'invalid-output',
            errors: [...compiled.errors, ...check.errors],
          };
    } catch {
      return { status: 'malformed-output' };
    }
  }
  private report(status: string, url: URL, apiVersion: string, homepage: any, scope: OnboardingScope, profile?: any, validation?: any, diagnostics?: any, requestedSlug?: string) {
    const displayName = url.hostname.replace(/^www\./, ''); const name = requestedSlug ?? displayName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
    return { status, probeOnly: true, approvalRequired: true, input: { url: url.toString(), proposedSlug: requestedSlug }, detection: { homepage, endpointHost: url.host, apiVersion }, scope, validation, diagnostics, proposedStore: status === 'proposal-ready' ? { name, displayName, baseUrl: url.origin, isActive: false, platformType: 'shopify_storefront', scraperType: profile.kind === 'builtin' ? 'binderpos' : 'default', rateLimitPerSecond: 15, discoveryConfig: { discoveryEnabled: false }, scraperConfig: { shopifyUrl: url.host, storefrontApiVersion: apiVersion, source: { kind: 'storefront-graphql', mode: 'products-query', productQuery: scope.query }, storefrontScope: scope.query, parser: profile } } : null };
  }
}

/**
 * Retains every parser-relevant Storefront field, but bounds the payload sent
 * to the model. The source catalog can contain hundreds of products; a
 * deterministic spread of examples plus a field inventory is enough to map
 * real values without leaking unrelated merchant payload data.
 */
function compactStorefrontEvidence(products: OnboardingProduct[]) {
  const variants = products.flatMap((product) => productVariants(product));
  const optionNames = [...new Set(
    variants.flatMap((variant) =>
      (variant.selectedOptions ?? []).map((option: any) => option.name),
    ),
  )].slice(0, 30);
  const tagCounts = countEvidenceValues(
    products.flatMap((product) => product.tags ?? []),
  );
  const productSample = products
    .slice()
    .sort((left, right) => stable(String(left.id)).localeCompare(stable(String(right.id))))
    .slice(0, 4)
    .map((product) => ({
      title: boundedText(product.title, MAX_IDENTITY_TEXT_LENGTH),
      handle: boundedText(product.handle, MAX_IDENTITY_TEXT_LENGTH),
      vendor: boundedText(product.vendor, MAX_IDENTITY_TEXT_LENGTH),
      productType: boundedText(product.productType, MAX_IDENTITY_TEXT_LENGTH),
      tags: (product.tags ?? [])
        .map((tag: unknown) => boundedText(tag, MAX_TAG_TEXT_LENGTH))
        .filter(Boolean)
        .slice(0, 20),
      // Merchant HTML is high-volume, noisy, and not needed to establish the
      // common title/SKU/option conventions used by mapping discovery.
      descriptionHtml: undefined,
      onlineStoreUrl: boundedText(product.onlineStoreUrl, MAX_URL_TEXT_LENGTH),
      availableForSale: product.availableForSale,
      variants: productVariants(product)
        .slice(0, 4)
        .map(sanitizeVariantEvidence),
    }));
  return {
    source: 'Shopify Storefront GraphQL products query',
    scopedProductCount: products.length,
    scopedVariantCount: variants.length,
    availableProductFields: [
      'id', 'title', 'handle', 'vendor', 'productType', 'tags',
      'descriptionHtml', 'onlineStoreUrl', 'availableForSale', 'images',
      'variants',
    ],
    availableVariantFields: [
      'id', 'title', 'sku', 'availableForSale', 'price',
      'selectedOptions', 'image',
    ],
    optionNames,
    commonTags: tagCounts,
    fieldPresence: {
      sku: variants.filter((variant) => variant.sku).length,
      image: variants.filter((variant) => variant.image?.url).length,
      selectedOptions: variants.filter((variant) => variant.selectedOptions?.length).length,
    },
    products: productSample,
  };
}

const MAX_EVIDENCE_TEXT_LENGTH = 160;
const MAX_IDENTITY_TEXT_LENGTH = 500;
const MAX_TAG_TEXT_LENGTH = 160;
const MAX_URL_TEXT_LENGTH = 1_000;

function boundedText(
  value: unknown,
  maximumLength = MAX_EVIDENCE_TEXT_LENGTH,
): string | undefined {
  const text = String(value ?? '').trim();
  return text && text.length <= maximumLength ? text : undefined;
}

function sanitizeVariantEvidence(variant: any) {
  return {
    title: boundedText(variant.title, MAX_IDENTITY_TEXT_LENGTH),
    sku: boundedText(variant.sku, MAX_IDENTITY_TEXT_LENGTH),
    availableForSale: variant.availableForSale,
    price: variant.price,
    selectedOptions: (variant.selectedOptions ?? [])
      .map((option: any) => ({
        name: boundedText(option.name, MAX_IDENTITY_TEXT_LENGTH),
        value: boundedText(option.value, MAX_IDENTITY_TEXT_LENGTH),
      }))
      .filter((option: any) => option.name && option.value),
  };
}

function countEvidenceValues(values: unknown[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const value of values) {
    const text = boundedText(value);
    if (text) counts.set(text, (counts.get(text) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 30);
}

function compileParserDraftAst(draft: any) {
  const errors: string[] = [];
  if (!draft?.requiresHumanReview || !Array.isArray(draft.fields)) {
    return { profile: null, errors: ['draft: missing required envelope fields'] };
  }
  const fields: Record<string, unknown> = {};
  for (const field of draft.fields) {
    if (typeof field?.field !== 'string') {
      errors.push('draft: field name is missing');
      continue;
    }
    if (field.source === 'constant') {
      fields[field.field] = { candidates: [{ value: field.constant, when: [] }] };
      continue;
    }
    if (typeof field.source !== 'string') {
      errors.push(`draft.${field.field}: source is missing`);
      continue;
    }
    if (field.source === 'product.tags' && field.field !== 'foil') {
      errors.push(
        `draft.${field.field}: product.tags is supported only for foil`,
      );
      continue;
    }
    if (
      field.source === 'variant.selectedOptions' &&
      (typeof field.optionName !== 'string' || !field.optionName.trim())
    ) {
      errors.push(`draft.${field.field}: selectedOptions requires optionName`);
      continue;
    }
    const transforms = [
      ...(field.source === 'variant.selectedOptions'
        ? [{ type: 'optionValue', name: field.optionName }]
        : []),
      ...(field.source === 'product.tags'
        ? [{ type: 'tagValue', mode: 'contains', value: 'foil' }]
        : []),
      ...((field.transforms ?? []).map((type: string) => ({ type }))),
    ];
    fields[field.field] = { candidates: [{ source: field.source, transforms, when: [] }] };
  }
  return {
    profile: { kind: 'mapping', version: 1, fields, exclusions: [] },
    errors,
  };
}

/**
 * Adds deterministic identity rules only when the sampled catalog establishes
 * the common MTG SKU and title convention. This makes collector-number
 * matching available without relying on the model to author free-form regexes.
 */
function enrichMtgSkuProfile(profile: any, products: OnboardingProduct[]) {
  if (profile?.kind !== 'mapping' || !usesMtgSkuConvention(products)) {
    return profile;
  }

  const fields = { ...profile.fields };
  fields.cardName = prependCandidate(fields.cardName, {
    source: 'product.title',
    transforms: [
      {
        type: 'regexReplace',
        pattern: '\\s*\\([A-Z0-9_]{2,8}-\\d+[A-Za-z]?\\)(?:\\s*:\\s*)?',
        replacement: '',
        flags: 'i',
      },
      {
        type: 'regexReplace',
        pattern: '\\s*\\((?:showcase|extended art|borderless|foil etched)\\)',
        replacement: '',
        flags: 'i',
      },
      { type: 'regexReplace', pattern: '\\s+(?:etched )?foil\\s*$', replacement: '', flags: 'i' },
      { type: 'trim' },
    ],
    when: [],
  });
  fields.setCode = prependCandidate(fields.setCode, {
    source: 'variant.sku',
    transforms: [
      { type: 'regexCapture', pattern: '^MTG-([A-Z0-9_]{2,8})-', group: 1 },
      { type: 'lowercase' },
    ],
    when: [],
  });
  fields.collectorNumber = prependCandidate(fields.collectorNumber, {
    source: 'variant.sku',
    transforms: [
      {
        type: 'regexCapture',
        pattern: '^MTG-[A-Z0-9_]{2,8}-(\\d+[A-Za-z]?)-',
        group: 1,
      },
    ],
    when: [],
  });

  return { ...profile, fields };
}

function usesMtgSkuConvention(products: OnboardingProduct[]) {
  const variants = products.flatMap(productVariants);
  const conventionVariants = variants.filter((variant: any) =>
    /^MTG-[A-Z0-9_]{2,8}-\d+[A-Za-z]?-/i.test(String(variant.sku ?? '')),
  );
  return variants.length >= 100 && conventionVariants.length / variants.length >= 0.95;
}

function prependCandidate(field: any, candidate: unknown) {
  return { candidates: [candidate, ...(field?.candidates ?? [])] };
}
