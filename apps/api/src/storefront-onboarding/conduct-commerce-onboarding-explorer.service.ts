import { Injectable } from '@nestjs/common';
import {
  ConductCommerceClient,
  ConductCommerceExtractionAdapter,
  type ExtractedCardVariant,
} from '@scoutlgs/core';
import { fetch } from 'undici';
import { StorefrontOnboardingIdentityService } from './storefront-onboarding-identity.service';

export type OnboardingInput = {
  url: string; proposedSlug?: string; currency?: string; timeoutMs: number;
};

/** Conduct-specific transport/sampling implementation for the common
 * onboarding outcome. New catalogue backends implement this boundary instead
 * of adding branches to the generic Shopify exploration service. */
@Injectable()
export class ConductCommerceOnboardingExplorer {
  constructor(
    private readonly client: ConductCommerceClient,
    private readonly adapter: ConductCommerceExtractionAdapter,
    private readonly identity: StorefrontOnboardingIdentityService,
  ) {}

  async detects(url: URL, timeoutMs: number): Promise<boolean> {
    try {
      const response = await fetch(url.toString(), {
        headers: { 'user-agent': 'ScoutLGS onboarding probe' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const html = await response.text();
      return /api\.conductcommerce\.com|conductcommerce/i.test(html);
    } catch { return false; }
  }

  async onboard(input: OnboardingInput) {
    const url = new URL(input.url); url.pathname = '/'; url.search = ''; url.hash = '';
    const currency = input.currency?.trim().toUpperCase();
    if (!currency || !/^[A-Z]{3}$/.test(currency))
      return this.report('rejected', url, input, { warnings: ['Conduct onboarding requires a merchant-confirmed ISO currency'] });
    const store: any = {
      uuid: '00000000-0000-4000-8000-000000000000', name: 'conduct-onboarding',
      displayName: url.hostname, baseUrl: url.origin, isActive: false,
      scraperType: 'conduct', platformType: 'conduct_commerce', rateLimitPerSecond: 1,
      scraperConfig: { platform: 'conduct_commerce', storefrontHost: url.hostname, currency,
        source: { kind: 'conduct-storefront-api', mode: 'magic-product-type', productTypeId: 1 },
        parser: { kind: 'builtin', version: 1, parserType: 'conduct' },
        parserConfig: { parserType: 'conduct', settings: {} },
      },
    };
    let settings: any;
    try { settings = await this.client.settings(store); }
    catch (error) { return this.report('failed', url, input, { warnings: [error instanceof Error ? error.message : 'Conduct catalog unavailable'] }); }
    const magic = settings.categories?.find((item: any) => String(item.name).trim().toLowerCase() === 'magic singles');
    if (!magic?.id || !Array.isArray(magic.categories))
      return this.report('rejected', url, input, { warnings: ['Conduct settings has no safely scoped Magic Singles product type'] });
    store.scraperConfig.source.productTypeId = magic.id;
    const parsed: Array<{ productId: string; variantId: string; variant: ExtractedCardVariant }> = [];
    const sampledCategories: string[] = [];
    for (const category of [...magic.categories].sort((a: any, b: any) => String(a.uniqueDisplayName).localeCompare(String(b.uniqueDisplayName)))) {
      try {
        const response = await this.client.listings(store, { productTypeID: magic.id, category: category.uniqueDisplayName });
        const variants = this.adapter.normalizeListings(store, response.listings).flatMap((product) =>
          product.variants.map((variant) => ({ productId: String(product.inventoryID), variantId: variant.platformVariantId ?? String(product.inventoryID), variant })));
        if (variants.length) { sampledCategories.push(category.uniqueDisplayName); parsed.push(...variants); }
        if (parsed.length >= 100) break;
      } catch (error) { return this.report('failed', url, input, { warnings: [error instanceof Error ? error.message : 'Conduct category probe failed'] }); }
    }
    if (parsed.length < 100)
      return this.report('rejected', url, input, { warnings: ['Conduct Magic scope produced fewer than 100 normalized variants'], productTypeId: magic.id, sampledCategories });
    const sample = parsed.slice(0, 100);
    const identity = await this.identity.evaluate(sample);
    const failures = identity.filter((result) => result.outcome !== 'exact-printing' && result.outcome !== 'token');
    const valid = !failures.length;
    return this.report(valid ? 'proposal-ready' : 'rejected', url, input, {
      productTypeId: magic.id, sampledCategories, sampledVariants: sample.length,
      identity: { failures: failures.length, counts: identity.reduce((all: Record<string, number>, item) => ({ ...all, [item.outcome]: (all[item.outcome] ?? 0) + 1 }), {}) },
    }, store.scraperConfig);
  }

  private report(status: string, url: URL, input: OnboardingInput, scope: Record<string, unknown>, scraperConfig?: Record<string, unknown>) {
    const displayName = url.hostname.replace(/^www\./, '');
    const name = input.proposedSlug ?? displayName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
    return { status, probeOnly: true, approvalRequired: true, input: { url: url.toString(), proposedSlug: input.proposedSlug }, detection: { platform: 'conduct_commerce', endpointHost: url.hostname }, scope, proposedStore: status === 'proposal-ready' ? { name, displayName, baseUrl: url.origin, isActive: false, platformType: 'conduct_commerce', scraperType: 'conduct', rateLimitPerSecond: 1, discoveryConfig: { discoveryEnabled: false }, scraperConfig } : null };
  }
}
