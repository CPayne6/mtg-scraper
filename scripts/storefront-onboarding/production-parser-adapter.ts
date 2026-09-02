import { dryRunStorefrontMappingProfile } from "../../packages/core/dist/platform/adapters/shopify-storefront/storefront-extraction.adapter.js";
import {
  normalizeStorefrontProfileInputs,
  validateStorefrontMappingProfileContract,
} from "../../packages/shared/dist/storefront-parser-profile.js";
import type { ParserDryRun, ScopeEvidence } from "./types.ts";

/** Endpoint-safe bridge to the exact fail-closed parser used by production extraction. */
export function productionParserAdapter() {
  return {
    validate(profile: unknown) {
      return validateStorefrontMappingProfileContract(profile);
    },
    dryRun(profile: any, products: any[], scope: ScopeEvidence): ParserDryRun {
      const contract = validateStorefrontMappingProfileContract(profile);
      if (!contract.valid) return failedContract(products, contract.errors, contract.warnings);

      const report = dryRunStorefrontMappingProfile(
        {
          uuid: "00000000-0000-4000-8000-000000000000",
          name: "onboarding-dry-run",
          displayName: "Onboarding dry run",
          baseUrl: "https://onboarding.invalid",
          isActive: false,
          scraperType: "default",
          platformType: "shopify_storefront",
          rateLimitPerSecond: 1,
          discoveryConfig: { discoveryEnabled: false },
          scraperConfig: { parser: profile },
        } as any,
        products as any,
      );
      const failuresByCode: Record<string, number> = { ...report.failuresByCode };
      const rejections = report.variants.flatMap((variant) =>
        variant.result.ok
          ? []
          : [{
              productId: variant.productId,
              variantId: variant.variantId,
              errors: variant.result.failures.map((failure) => failure.code),
            }],
      );
      const conflicts = conflictingVariantIds(products);
      if (conflicts.length) {
        failuresByCode["duplicate-variant-id"] = conflicts.length;
        rejections.push(...conflicts.map((variantId) => ({
          variantId,
          errors: ["duplicate-variant-id"],
        })));
      }
      const validVariants = Math.max(0, report.validVariants - conflicts.length);
      const coverage = report.sampledVariants ? validVariants / report.sampledVariants : 0;
      const errors: string[] = [];
      if (!scope.ok) errors.push("unsafe scope");
      if (validVariants < 100) errors.push(`requires 100 valid variants; found ${validVariants}`);
      if (coverage < 0.95)
        errors.push(`requires 95% structural coverage; found ${(coverage * 100).toFixed(1)}%`);
      if (conflicts.length) errors.push(`conflicting duplicate variant IDs: ${conflicts.length}`);

      return {
        valid: !errors.length,
        sampledProducts: report.sampledProducts,
        sampledVariants: report.sampledVariants,
        validVariants,
        rejectedVariants: report.sampledVariants - validVariants,
        coverage,
        failuresByCode,
        fieldFailures: {
          cardName: failuresByCode["missing-card-name"] ?? 0,
          condition: failuresByCode["unknown-condition"] ?? 0,
          identity: failuresByCode["missing-set-identity"] ?? 0,
          price: failuresByCode["invalid-price"] ?? 0,
        },
        rejections: rejections.slice(0, 100),
        errors,
        warnings: contract.warnings,
      } as ParserDryRun;
    },
  };
}

function conflictingVariantIds(products: any[]): string[] {
  const fingerprints = new Map<string, string>();
  const conflicts = new Set<string>();
  for (const product of products) for (const input of normalizeStorefrontProfileInputs(product)) {
    const id = input.variant.id;
    if (!id) continue;
    const fingerprint = JSON.stringify({
      product: input.product.handle,
      title: input.variant.title,
      sku: input.variant.sku,
      price: input.variant.price,
      options: input.variant.selectedOptions,
    });
    if (fingerprints.has(id) && fingerprints.get(id) !== fingerprint) conflicts.add(id);
    else fingerprints.set(id, fingerprint);
  }
  return [...conflicts];
}

function failedContract(products: any[], errors: string[], warnings: string[]): ParserDryRun {
  const sampledVariants = products.reduce(
    (total, product) => total + normalizeStorefrontProfileInputs(product).length,
    0,
  );
  return {
    valid: false,
    sampledProducts: products.length,
    sampledVariants,
    validVariants: 0,
    rejectedVariants: sampledVariants,
    coverage: 0,
    failuresByCode: {},
    rejections: [],
    errors,
    warnings,
  };
}
