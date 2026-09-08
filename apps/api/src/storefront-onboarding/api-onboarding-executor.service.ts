import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, readFileSync } from 'fs';
import { fetch } from 'undici';
import {
  dryRunStorefrontBinderposParser,
  dryRunStorefrontBuiltinParser,
  dryRunStorefrontMappingProfile,
  PRODUCTS_BY_CREATED_AT_QUERY,
  PRODUCT_CREATED_AT_ASC_QUERY,
  PRODUCT_CREATED_AT_DESC_QUERY,
  generateYearlyBuckets,
  VerifiedStorefrontOnboardingService,
} from '@scoutlgs/core';
import { validateStorefrontMappingProfileContract } from '@scoutlgs/shared';
import { StorefrontOnboardingIdentityService } from './storefront-onboarding-identity.service';

const ONBOARDING_SAMPLE_VARIANTS = 150;
const ONBOARDING_MAX_BUCKET_PAGES = 100;
const ONBOARDING_MAX_PRODUCT_PAGES = ONBOARDING_MAX_BUCKET_PAGES;

type StorefrontOnboardingPage = {
  ok: boolean;
  products: any[];
  hasNextPage?: boolean;
  endCursor?: string | null;
  error?: string;
  retryWithSmallerPage?: boolean;
};

@Injectable()
export class ShopifyStorefrontOnboardingExplorer {
  constructor(private readonly config: ConfigService, private readonly identity: StorefrontOnboardingIdentityService) {}

  async onboard(input: { url: string; proposedSlug?: string; scope?: string; currency?: string; parserProfile?: unknown; aiDiscovery: boolean; timeoutMs: number }) {
    const groqApiKey = this.groqApiKey();
    const service = new VerifiedStorefrontOnboardingService({
      storefront: {
        homepage: (url, timeoutMs) => this.homepage(url, timeoutMs),
        // The unscoped probe only discovers candidate scope values; the
        // scoped probe uses the production-style bucket traversal to gather
        // the deterministic identity sample.
        products: (url, version, scope, timeoutMs, first) => scope
          ? this.products(url, version, scope, timeoutMs, first)
          : this.products(url, version, scope, timeoutMs, first, 1, 0),
        productsByTitle: (url, version, title, timeoutMs) =>
          this.products(url, version, `title:${JSON.stringify(title)}`, timeoutMs, 20, 1, 0),
      },
      parser: this.parser(), identity: this.identity,
      ai: groqApiKey ? {
        discover: (request) => this.groq(request),
        discoverScope: (request) => this.groqScope(request),
      } : undefined,
    });
    return service.onboard(input);
  }

  async detects(url: URL, timeoutMs: number): Promise<boolean> {
    const homepage = await this.homepage(url, timeoutMs);
    const signals = homepage?.signals ?? {};
    return Boolean(signals.shopifyGlobal || signals.shopifyCdn);
  }

  private async homepage(url: URL, timeoutMs: number) {
    try {
      const response = await fetch(url.toString(), { headers: { 'user-agent': 'ScoutLGS onboarding probe' }, signal: AbortSignal.timeout(timeoutMs) });
      const html = await response.text();
      return { ok: response.ok, status: response.status, signals: { shopifyGlobal: /Shopify\.shop|cdn\.shopify\.com/i.test(html), shopifyCdn: /cdn\.shopify\.com/i.test(html), binderScript: /binderpos|binder\s*pos/i.test(html), binderInventory: /inventory|variants/i.test(html) } };
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'homepage unavailable', signals: {} }; }
  }
  private async products(
    url: URL,
    version: string,
    scope: string | null,
    timeoutMs: number,
    first = 250,
    maxPages = ONBOARDING_MAX_PRODUCT_PAGES,
    minimumVariants = ONBOARDING_SAMPLE_VARIANTS,
  ) {
    const range = await this.createdAtRange(url, version, scope ?? '', timeoutMs);
    if (!range.ok) return { ok: false, products: [], error: range.error };
    if (!range.min || !range.max) return { ok: true, products: [] };
    const buckets = generateYearlyBuckets(range.min, range.max);
    const products: any[] = [];
    const seen = new Set<string>();
    for (const bucket of buckets) {
      let after: string | null = null;
      let pageCount = 0;
      while (pageCount++ < Math.min(maxPages, ONBOARDING_MAX_BUCKET_PAGES)) {
        const query = `${scope ?? ''} created_at:>='${bucket.start}' created_at:<'${bucket.end}'`;
        const page = await this.productsPage(url, version, query, timeoutMs, first, after);
        if (!page.ok && page.retryWithSmallerPage && first > 50) {
          first = 50;
          continue;
        }
        if (!page.ok) return { ok: false, products: [], error: page.error ?? 'catalog unavailable' };
        for (const product of page.products) {
          const id = String(product.id ?? '');
          if (id && !seen.has(id)) { seen.add(id); products.push(product); }
        }
        const variants = products.reduce((count, product) => count + (product.variants?.nodes?.length ?? 0), 0);
        if (variants >= minimumVariants || !page.hasNextPage || !page.endCursor) break;
        after = page.endCursor;
      }
      const variants = products.reduce((count, product) => count + (product.variants?.nodes?.length ?? 0), 0);
      if (variants >= minimumVariants) break;
    }
    return { ok: true, products };
  }

  private async productsPage(
    url: URL,
    version: string,
    scope: string | null,
    timeoutMs: number,
    first: number,
    after: string | null,
  ): Promise<StorefrontOnboardingPage> {
    const endpoint = `${url.origin}/api/${version}/graphql.json`;
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', 'user-agent': 'ScoutLGS onboarding probe' }, body: JSON.stringify({ query: PRODUCTS_BY_CREATED_AT_QUERY, variables: { first, after, query: scope } }), signal: AbortSignal.timeout(timeoutMs) });
      const body: any = await response.json();
      // Some otherwise valid Storefront tenants reject high-complexity probes
      // (many products × variants) with an internal GraphQL error. Sampling is
      // sufficient for onboarding, so retry once with a smaller bounded page.
      if (body.errors?.length && first > 50)
        return { ok: false, products: [], retryWithSmallerPage: true };
      if (!response.ok || body.errors?.length) return { ok: false, products: [], error: body.errors?.map((e: any) => e.message).join('; ') ?? `HTTP ${response.status}` };
      const connection = body.data?.products;
      return { ok: true, products: (connection?.edges ?? []).map((edge: any) => edge.node), hasNextPage: connection?.pageInfo?.hasNextPage === true, endCursor: connection?.pageInfo?.endCursor ?? null };
    } catch (error) { return { ok: false, products: [], error: error instanceof Error ? error.message : 'catalog unavailable' }; }
  }

  private async createdAtRange(url: URL, version: string, scope: string, timeoutMs: number) {
    const endpoint = `${url.origin}/api/${version}/graphql.json`;
    const query = async (document: string) => {
      try {
        const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', 'user-agent': 'ScoutLGS onboarding probe' }, body: JSON.stringify({ query: document, variables: { query: scope } }), signal: AbortSignal.timeout(timeoutMs) });
        const body: any = await response.json();
        if (!response.ok || body.errors?.length) return { ok: false, error: body.errors?.map((e: any) => e.message).join('; ') ?? `HTTP ${response.status}` };
        return { ok: true, value: body.data?.products?.edges?.[0]?.node?.createdAt ?? null };
      } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'catalog unavailable' }; }
    };
    const [ascending, descending] = await Promise.all([
      query(PRODUCT_CREATED_AT_ASC_QUERY), query(PRODUCT_CREATED_AT_DESC_QUERY),
    ]);
    if (!ascending.ok || !descending.ok) return { ok: false, error: ascending.error ?? descending.error };
    return { ok: true, min: ascending.value, max: descending.value };
  }
  private parser() {
    return {
      validate: (profile: any) => profile?.kind === 'builtin' ? (profile.version === 1 ? { valid: true, errors: [], warnings: [] } : { valid: false, errors: ['Unsupported builtin parser version'], warnings: [] }) : validateStorefrontMappingProfileContract(profile),
      dryRun: (profile: any, products: any[], scope: any, parserSettings: any = {}) => {
        const contract = profile?.kind === 'builtin' ? this.parser().validate(profile) : validateStorefrontMappingProfileContract(profile);
        if (!contract.valid) return { valid: false, errors: contract.errors, warnings: contract.warnings, parsedVariants: [] };
        const report = profile.kind === 'builtin' ? dryRunStorefrontBuiltinParser(products, profile.parserType, { excludeF2fScanListings: parserSettings.excludeScanListings === true }) : dryRunStorefrontMappingProfile({ uuid: '00000000-0000-4000-8000-000000000000', name: 'onboarding', displayName: 'onboarding', baseUrl: 'https://onboarding.invalid', isActive: false, scraperType: 'default', platformType: 'shopify_storefront', rateLimitPerSecond: 1, discoveryConfig: { discoveryEnabled: false }, scraperConfig: { parser: profile } } as any, products);
        const parsedVariants = report.variants.flatMap((v) =>
          v.result.ok
            ? [{ productId: v.productId, variantId: v.variantId, variant: v.result.variant }]
            : [],
        );
        const errors = [...(!scope.ok ? ['unsafe scope'] : []), ...(report.sampledVariants < 100 ? ['requires 100 sampled variants'] : []), ...(report.coverage < .95 ? [`requires 95% structural coverage; found ${(report.coverage * 100).toFixed(1)}%`] : [])];
        const rejections = report.variants.flatMap((v) =>
          !v.result.ok
            ? [{ productId: v.productId, variantId: v.variantId, errors: v.result.failures.map((f) => f.code) }]
            : [],
        );
        return { valid: !errors.length, ...report, errors, warnings: contract.warnings, parsedVariants, rejections };
      },
    };
  }
  private async groq(input: { evidence: unknown; correctiveErrors?: string[]; timeoutMs: number }) {
    return this.groqParserDraftAst(input);
    /*
    const started = Date.now();
    const profileExample = { kind: 'mapping', version: 1, fields: {} };
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { authorization: `Bearer ${this.config.get<string>('GROQ_API_KEY')}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: this.config.get<string>('AI_MODEL') ?? 'llama-3.3-70b-versatile', temperature: 0, max_completion_tokens: 3000, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: `Return only JSON. The root object must have requiresHumanReview:true and parserProfileJson, where parserProfileJson is a JSON-encoded complete version-1 mapping profile. Use this exact grammar example: ${JSON.stringify(profileExample)}. The fields object contains only valid field rules; never place exclusions inside a field. Omit setCode and collectorNumber if unsupported—never use null. Every field rule is {candidates:[...]}; cardName, condition, foil, and isToken are required. Never emit a builtin profile or invent option names.` }, { role: 'user', content: JSON.stringify(input) }] }), signal: AbortSignal.timeout(input.timeoutMs) });
      if (!response.ok) return { kind: 'transport-error' as const, status: response.status, reason: `Groq HTTP ${response.status}`, transient: response.status >= 500 || response.status === 429 };
      const body: any = await response.json(); const content = body.choices?.[0]?.message?.content;
      if (typeof content !== 'string') return { kind: 'transport-error' as const, reason: 'Groq returned no message content' };
      return { kind: 'success' as const, content, provider: 'groq', model: body.model, latencyMs: Date.now() - started };
    } catch (error) { return { kind: 'transport-error' as const, reason: error instanceof Error ? error.message : 'Groq unavailable', transient: true }; }
    */
  }

  private groqApiKey(): string | undefined {
    const configuredKey = this.config.get<string>('GROQ_API_KEY');
    if (configuredKey) return configuredKey;

    const keyFile = this.config.get<string>('GROQ_API_KEY_FILE');
    if (!keyFile || !existsSync(keyFile)) return undefined;
    return readFileSync(keyFile, 'utf8').trim() || undefined;
  }

  private async groqParserDraftAst(input: { evidence: unknown; timeoutMs: number }) {
    let lastFailure: {
      kind: 'transport-error';
      status?: number;
      reason: string;
    } | undefined;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await this.requestGroqParserDraft(input);
      if (result.kind === 'success') return result;
      lastFailure = result;
      if (result.status !== 400 || !result.reason.includes('Failed to validate JSON')) {
        return result;
      }
    }

    return lastFailure!;
  }

  private async requestGroqParserDraft(input: {
    evidence: unknown;
    timeoutMs: number;
  }) {
    try {
      const groqApiKey = this.groqApiKey();
      if (!groqApiKey) {
        return { kind: 'transport-error' as const, reason: 'Groq API key is not configured' };
      }
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${groqApiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.get<string>('AI_MODEL') ?? 'llama-3.3-70b-versatile',
          temperature: 0,
          max_completion_tokens: 1800,
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'parser_draft_ast', strict: true, schema: parserDraftAstSchema() },
          },
          messages: [
            {
              role: 'system',
              content: [
                'Infer a parser draft from Shopify evidence.',
                'Return cardName, condition, foil, isToken, and either setName or setCode.',
                'Use only observed option names and tag text.',
                'Use product.tags only for the foil field.',
                'Use constant only for false foil or isToken.',
                'For non-option sources optionName must be null.',
                'The result is compiled and validated locally.',
              ].join(' '),
            },
            { role: 'user', content: JSON.stringify(input) },
          ],
        }),
        signal: AbortSignal.timeout(input.timeoutMs),
      });
      const body: any = await response.json();
      const content = body.choices?.[0]?.message?.content;
      if (!response.ok || typeof content !== 'string') {
        return { kind: 'transport-error' as const, status: response.status, reason: body.error?.message ?? `Groq HTTP ${response.status}` };
      }
      return { kind: 'success' as const, content, provider: 'groq', model: body.model };
    } catch (error) {
      return { kind: 'transport-error' as const, reason: error instanceof Error ? error.message : 'Groq unavailable' };
    }
  }

  private async groqScope(input: { anchors: Array<{ title: string; products: unknown[] }>; timeoutMs: number }) {
    const system = [
      'Return JSON {"candidates":[{"selectors":[{"field":',
      '"productType|tag|vendor","value":"exact observed value"}],',
      '"rationale":"..."}]}.',
      'Given independent named Magic-card search results from one store,',
      'identify catalog-wide scopes likely to contain Magic singles.',
      'A selector value must be an exact literal observed in at least two',
      'independent anchors. Prefer the smallest shared selector set that',
      'separates Magic singles from other games.',
      'Do not use card names, set names, colours, rarities, finishes, prices,',
      'stock/availability, or SKU values. Do not invent field names or values.',
      'Return an empty candidates array if evidence is insufficient.',
    ].join(' ');
    try {
      const groqApiKey = this.groqApiKey();
      if (!groqApiKey) {
        return { kind: 'transport-error' as const, reason: 'Groq API key is not configured' };
      }
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${groqApiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.get<string>('AI_MODEL') ?? 'llama-3.3-70b-versatile',
          temperature: 0,
          max_completion_tokens: 1600,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: JSON.stringify(input) },
          ],
        }),
        signal: AbortSignal.timeout(input.timeoutMs),
      });
      const body: any = await response.json();
      const content = body.choices?.[0]?.message?.content;
      if (!response.ok || typeof content !== 'string') {
        return {
          kind: 'transport-error' as const,
          reason: body.error?.message ?? `Groq HTTP ${response.status}`,
        };
      }
      return { kind: 'success' as const, content };
    } catch (error) {
      return {
        kind: 'transport-error' as const,
        reason: error instanceof Error ? error.message : 'Groq unavailable',
      };
    }
  }
}

function parserDraftAstSchema() {
  const nullableString = { type: ['string', 'null'] };

  return {
    type: 'object',
    additionalProperties: false,
    required: ['requiresHumanReview', 'fields'],
    properties: {
      requiresHumanReview: { type: 'boolean', enum: [true] },
      fields: {
        type: 'array',
        minItems: 5,
        maxItems: 7,
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'field',
            'source',
            'optionName',
            'constant',
            'transforms',
          ],
          properties: {
            field: {
              type: 'string',
              enum: [
                'cardName',
                'setName',
                'setCode',
                'collectorNumber',
                'condition',
                'foil',
                'isToken',
              ],
            },
            source: {
              type: 'string',
              enum: [
                'product.title',
                'product.vendor',
                'product.tags',
                'variant.title',
                'variant.sku',
                'variant.selectedOptions',
                'constant',
              ],
            },
            optionName: nullableString,
            constant: { type: ['string', 'boolean', 'null'] },
            transforms: {
              type: 'array',
              items: { type: 'string', enum: ['trim', 'condition', 'foil'] },
            },
          },
        },
      },
    },
  };
}
