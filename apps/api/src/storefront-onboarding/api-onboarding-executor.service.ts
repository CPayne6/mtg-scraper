import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fetch } from 'undici';
import {
  dryRunStorefrontBinderposParser,
  dryRunStorefrontMappingProfile,
  VerifiedStorefrontOnboardingService,
} from '@scoutlgs/core';
import { validateStorefrontMappingProfileContract } from '@scoutlgs/shared';
import { StorefrontOnboardingIdentityService } from './storefront-onboarding-identity.service';

const PRODUCTS = `query Products($first:Int!, $query:String) { products(first:$first, query:$query) { nodes { id title vendor productType tags descriptionHtml variants(first:250) { nodes { id title sku price { amount currencyCode } selectedOptions { name value } image { url } } } } } }`;

@Injectable()
export class ApiStorefrontOnboardingExecutor {
  constructor(private readonly config: ConfigService, private readonly identity: StorefrontOnboardingIdentityService) {}

  async onboard(input: { url: string; proposedSlug?: string; scope?: string; parserProfile?: unknown; aiDiscovery: boolean; timeoutMs: number }) {
    const service = new VerifiedStorefrontOnboardingService({
      storefront: {
        homepage: (url, timeoutMs) => this.homepage(url, timeoutMs),
        products: (url, version, scope, timeoutMs, first) => this.products(url, version, scope, timeoutMs, first),
      },
      parser: this.parser(), identity: this.identity,
      ai: this.config.get<string>('GROQ_API_KEY') ? { discover: (request) => this.groq(request) } : undefined,
    });
    return service.onboard(input);
  }

  private async homepage(url: URL, timeoutMs: number) {
    try {
      const response = await fetch(url.toString(), { headers: { 'user-agent': 'ScoutLGS onboarding probe' }, signal: AbortSignal.timeout(timeoutMs) });
      const html = await response.text();
      return { ok: response.ok, status: response.status, signals: { shopifyGlobal: /Shopify\.shop|cdn\.shopify\.com/i.test(html), shopifyCdn: /cdn\.shopify\.com/i.test(html), binderScript: /binderpos|binder\s*pos/i.test(html), binderInventory: /inventory|variants/i.test(html) } };
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'homepage unavailable', signals: {} }; }
  }
  private async products(url: URL, version: string, scope: string | null, timeoutMs: number, first = 250) {
    const endpoint = `${url.origin}/api/${version}/graphql.json`;
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', 'user-agent': 'ScoutLGS onboarding probe' }, body: JSON.stringify({ query: PRODUCTS, variables: { first, query: scope } }), signal: AbortSignal.timeout(timeoutMs) });
      const body: any = await response.json();
      if (!response.ok || body.errors?.length) return { ok: false, products: [], error: body.errors?.map((e: any) => e.message).join('; ') ?? `HTTP ${response.status}` };
      return { ok: true, products: body.data?.products?.nodes ?? [] };
    } catch (error) { return { ok: false, products: [], error: error instanceof Error ? error.message : 'catalog unavailable' }; }
  }
  private parser() {
    return {
      validate: (profile: any) => profile?.kind === 'builtin' ? (profile.version === 1 && profile.parserType === 'binderpos' ? { valid: true, errors: [], warnings: [] } : { valid: false, errors: ['Only BinderPOS is a supported builtin'], warnings: [] }) : validateStorefrontMappingProfileContract(profile),
      dryRun: (profile: any, products: any[], scope: any) => {
        const contract = profile?.kind === 'builtin' ? this.parser().validate(profile) : validateStorefrontMappingProfileContract(profile);
        if (!contract.valid) return { valid: false, errors: contract.errors, warnings: contract.warnings, parsedVariants: [] };
        const report = profile.kind === 'builtin' ? dryRunStorefrontBinderposParser(products) : dryRunStorefrontMappingProfile({ uuid: '00000000-0000-4000-8000-000000000000', name: 'onboarding', displayName: 'onboarding', baseUrl: 'https://onboarding.invalid', isActive: false, scraperType: 'default', platformType: 'shopify_storefront', rateLimitPerSecond: 1, discoveryConfig: { discoveryEnabled: false }, scraperConfig: { parser: profile } } as any, products);
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
    const started = Date.now();
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { authorization: `Bearer ${this.config.get<string>('GROQ_API_KEY')}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: this.config.get<string>('AI_MODEL') ?? 'llama-3.3-70b-versatile', response_format: { type: 'json_object' }, messages: [{ role: 'system', content: 'Return only a JSON onboarding mapping draft with parserProfile and requiresHumanReview true.' }, { role: 'user', content: JSON.stringify(input) }] }), signal: AbortSignal.timeout(input.timeoutMs) });
      if (!response.ok) return { kind: 'transport-error' as const, status: response.status, reason: `Groq HTTP ${response.status}`, transient: response.status >= 500 || response.status === 429 };
      const body: any = await response.json(); const content = body.choices?.[0]?.message?.content;
      if (typeof content !== 'string') return { kind: 'transport-error' as const, reason: 'Groq returned no message content' };
      return { kind: 'success' as const, content, provider: 'groq', model: body.model, latencyMs: Date.now() - started };
    } catch (error) { return { kind: 'transport-error' as const, reason: error instanceof Error ? error.message : 'Groq unavailable', transient: true }; }
  }
}
