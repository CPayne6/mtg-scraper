import { validateDraftEnvelope } from "./schema.ts";
import { MTG_ANCHOR_FIXTURES } from "./mtg-anchor-fixtures.ts";
import type {
  IdentityEvaluation,
  ScopeEvidence,
  StorefrontOnboardingDependencies,
  StorefrontOnboardingRequest,
} from "./types.ts";

/**
 * Runs the fixed named-card probe without assuming a catalog scope. The
 * observations are deliberately not accepted as MTG proof until the production
 * identity matcher scores them in the next onboarding stage.
 */
export async function collectAnchorObservations(
  storefront: StorefrontOnboardingDependencies["storefront"],
  url: URL,
  apiVersion: string,
  timeoutMs: number,
) {
  if (!storefront.productsByTitle) return [];
  const observations: any[] = [];
  for (const fixture of MTG_ANCHOR_FIXTURES) {
    let response: any = null;
    let query = "";
    for (const alias of fixture.aliases) {
      query = `title:${quote(alias)}`;
      response = await storefront.productsByTitle(url, apiVersion, alias, timeoutMs, 20);
      if (response.ok && response.products.length) break;
    }
    observations.push({
      fixture,
      query,
      products: response?.products ?? [],
      error: response?.error ?? null,
    });
  }
  return observations;
}

export function detectHomepageBinder(homepage: any) {
  const signals = homepage?.signals ?? {};
  const evidence = [
    "binderScript",
    "binderInventory",
    "binderProductData",
  ].filter((key) => signals[key]);
  return { detected: evidence.length >= 2, evidence };
}

const quote = (s: string) =>
  `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const count = (items: string[]) =>
  Object.entries(
    items
      .filter(Boolean)
      .reduce(
        (a: Record<string, number>, x) => ((a[x] = (a[x] ?? 0) + 1), a),
        {},
      ),
  ).sort((a, b) => b[1] - a[1]);
const tags = (p: any) =>
  Array.isArray(p.tags)
    ? p.tags
    : String(p.tags ?? "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
const variants = (p: any) =>
  p.variants?.nodes ?? p.variants?.edges?.map((x: any) => x.node) ?? [];
const safeSlug = (value: string) =>
  value
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function inferScopeCandidates(products: any[]): ScopeEvidence[] {
  const typed = count(
    products
      .map((p) => p.productType ?? p.product_type)
      .filter((x: string) =>
        /(?:magic|mtg).*singles?|singles?.*(?:magic|mtg)/i.test(x),
      ),
  );
  const explicitTags = count(
    products
      .flatMap(tags)
      .filter((x: string) =>
        /^(?:mtg|magic(?:\s*:\s*the\s*gathering)?)\s+singles?$/i.test(x),
      ),
  );
  const mtgTags = count(
    products.flatMap(tags).filter((x: string) => /\b(?:mtg|magic)\b/i.test(x)),
  );
  const singlesVendors = count(
    products
      .filter(
        (p) =>
          /^singles?$/i.test(p.productType ?? p.product_type ?? "") &&
          /(?:magic|mtg)/i.test(p.vendor ?? ""),
      )
      .map((p) => p.vendor),
  );
  const out: ScopeEvidence[] = [];
  if (typed[0])
    out.push({
      ok: false,
      query: `product_type:${quote(typed[0][0])}`,
      strategy: "explicit-mtg-product-type",
      source: "inferred",
      evidence: { productType: typed[0][0] },
      warnings: [],
    });
  if (explicitTags[0])
    out.push({
      ok: false,
      query: `tag:${quote(explicitTags[0][0])}`,
      strategy: "explicit-mtg-singles-tag",
      source: "inferred",
      evidence: { tag: explicitTags[0][0] },
      warnings: [],
    });
  if (singlesVendors[0])
    out.push({
      ok: false,
      query: `product_type:"Singles" vendor:${quote(singlesVendors[0][0])}`,
      strategy: "singles-plus-mtg-vendor",
      source: "inferred",
      evidence: { vendor: singlesVendors[0][0] },
      warnings: [],
    });
  if (mtgTags[0])
    out.push({
      ok: false,
      query: `product_type:"Singles" tag:${quote(mtgTags[0][0])}`,
      strategy: "singles-plus-mtg-tag",
      source: "inferred",
      evidence: { tag: mtgTags[0][0] },
      warnings: [],
    });
  return out;
}
export function assessScope(
  query: string,
  strategy: string,
  source: "manual" | "inferred",
  products: any[],
): ScopeEvidence {
  const productTypes = count(
    products.map((p) => p.productType ?? p.product_type),
  );
  const vendors = count(products.map((p) => p.vendor));
  const tagCounts = count(products.flatMap(tags));
  const productCount = products.length;
  const variantCount = products.reduce((n, p) => n + variants(p).length, 0);
  const mtg = products.filter((p) =>
    /(?:magic|mtg)/i.test(
      `${p.productType ?? p.product_type ?? ""} ${p.vendor ?? ""} ${tags(p).join(" ")}`,
    ),
  ).length;
  const singles = products.filter((p) =>
    /single/i.test(
      `${p.productType ?? p.product_type ?? ""} ${tags(p).join(" ")}`,
    ),
  ).length;
  const warnings: string[] = [];
  if (!productCount) warnings.push("scope returned no products");
  if (
    productCount &&
    (mtg / productCount < 0.9 || singles / productCount < 0.7)
  )
    warnings.push("mixed or non-singles catalogue contamination");
  return {
    ok: !!productCount && !warnings.length,
    query,
    strategy,
    source,
    evidence: {
      productTypes: productTypes.slice(0, 10),
      vendors: vendors.slice(0, 10),
      tags: tagCounts.slice(0, 15),
      mtgProducts: mtg,
      singlesProducts: singles,
    },
    warnings,
    productCount,
    variantCount,
  };
}
export function selectDiverseProducts(products: any[]) {
  const pool = products
    .filter((p) => variants(p).length)
    .map((p, i) => ({
      p,
      i,
      keys: [
        p.productType ?? "",
        (variants(p)[0]?.selectedOptions ?? [])
          .map((o: any) => o.name)
          .join("|"),
        String(p.title ?? "").replace(/[A-Za-z0-9]+/g, "#"),
        String(variants(p)[0]?.sku ?? "").replace(/[A-Za-z0-9]+/g, "#"),
        String(p.title ?? "").match(/\[([^\]]+)\]/)?.[1] ?? "",
      ],
    }));
  const seen = new Set<string>();
  const result: any[] = [];
  while (pool.length && result.length < 5) {
    const ix = pool.findIndex((x) => x.keys.some((k) => k && !seen.has(k)));
    const next = pool.splice(ix < 0 ? 0 : ix, 1)[0];
    result.push(next.p);
    next.keys.forEach((k) => seen.add(k));
  }
  return result;
}
export function compactEvidence(products: any[], storeHost?: string) {
  const all = products.flatMap((p) => variants(p).map((v: any) => ({ p, v })));
  const chosen = selectDiverseProducts(products);
  const shape = (x: unknown) =>
    String(x ?? "")
      .replace(/[A-Za-z]+/g, "A")
      .replace(/\d+/g, "9")
      .slice(0, 80);
  return {
    promptVersion: 1,
    storeHost,
    represented: { products: products.length, variants: all.length },
    statistics: {
      fieldPresence: {
        title:
          products.filter((p) => p.title).length / Math.max(1, products.length),
        sku: all.filter((x) => x.v.sku).length / Math.max(1, all.length),
        selectedOptions:
          all.filter((x) => x.v.selectedOptions?.length).length /
          Math.max(1, all.length),
      },
      productTypes: count(products.map((p) => p.productType)).slice(0, 10),
      vendors: count(products.map((p) => p.vendor)).slice(0, 10),
      tags: count(products.flatMap(tags)).slice(0, 15),
      optionNames: count(
        all.flatMap((x) => (x.v.selectedOptions ?? []).map((o: any) => o.name)),
      ).slice(0, 12),
      optionValues: count(
        all.flatMap((x) =>
          (x.v.selectedOptions ?? []).map((o: any) => o.value),
        ),
      ).slice(0, 20),
      titleShapes: count(products.map((p) => shape(p.title))).slice(0, 10),
      skuShapes: count(all.map((x) => shape(x.v.sku))).slice(0, 10),
    },
    products: chosen.map((p) => ({
      title: String(p.title ?? "").slice(0, 240),
      vendor: String(p.vendor ?? "").slice(0, 120),
      productType: String(p.productType ?? "").slice(0, 120),
      tags: tags(p)
        .slice(0, 12)
        .map((x) => x.slice(0, 100)),
      // Product HTML is both noisy and expensive to send to the model. A
      // short prefix still exposes any embedded set/printing convention;
      // titles, SKUs and selected options remain the primary evidence.
      descriptionHtml: String(p.descriptionHtml ?? "").slice(0, 120),
      variants: variants(p)
        .slice(0, 3)
        .map((v: any) => ({
          id: String(v.id ?? "").slice(-60),
          title: String(v.title ?? "").slice(0, 160),
          sku: String(v.sku ?? "").slice(0, 160),
          price: v.price,
          selectedOptions: (v.selectedOptions ?? []).slice(0, 5),
        })),
    })),
  };
}

export class StorefrontOnboardingService {
  constructor(private readonly deps: StorefrontOnboardingDependencies) {}
  async onboard(request: StorefrontOnboardingRequest): Promise<any> {
    const baseUrl = new URL(request.url);
    if (!/^https?:$/.test(baseUrl.protocol))
      throw new Error("Only http(s) URLs are supported");
    baseUrl.pathname = "/";
    baseUrl.search = "";
    baseUrl.hash = "";
    const timeoutMs = request.timeoutMs ?? 15_000,
      apiVersion = request.apiVersion ?? "2026-04";
    const homepage = await this.deps.storefront.homepage(baseUrl, timeoutMs);
    // Named anchor searches are deliberately the first Storefront catalogue
    // interaction. A broad catalogue query is only a fallback for older test
    // clients that cannot yet issue title searches.
    const anchors = await collectAnchorObservations(
      this.deps.storefront,
      baseUrl,
      apiVersion,
      timeoutMs,
    );
    const anchorProducts = dedupeProducts(anchors.flatMap((x) => x.products));
    const catalog = anchorProducts.length
      ? { ok: true, products: anchorProducts, endpoint: "anchor-search", status: 200 }
      : await this.deps.storefront.products(
          baseUrl,
          apiVersion,
          null,
          timeoutMs,
          100,
        );
    if (!catalog.ok)
      return this.result(
        "access-failed",
        baseUrl,
        apiVersion,
        homepage,
        {
          ok: false,
          query: null,
          strategy: "unavailable",
          source: "inferred",
          warnings: [catalog.error ?? "Storefront catalog unavailable"],
        },
        null,
        null,
        { status: "not-called" },
      );
    const candidates = request.scope
      ? [
          {
            query: request.scope,
            strategy: "manual",
            source: "manual" as const,
          },
        ]
      : inferScopeCandidates(catalog.products).map((x) => ({
          query: x.query!,
          strategy: x.strategy,
          source: x.source,
        }));
    let scope: ScopeEvidence | null = null;
    let scoped: any = null;
    for (const candidate of candidates) {
      const response = await this.deps.storefront.products(
        baseUrl,
        apiVersion,
        candidate.query,
        timeoutMs,
        250,
      );
      const assessed = assessScope(
        candidate.query,
        candidate.strategy,
        candidate.source,
        response.products ?? [],
      );
      if (assessed.ok) {
        scope = assessed;
        scoped = response;
        break;
      }
      scope ??= assessed;
    }
    if (!scope?.ok || !scoped?.ok)
      return this.result(
        "scope-required",
        baseUrl,
        apiVersion,
        homepage,
        scope ?? {
          ok: false,
          query: null,
          strategy: "none",
          source: "inferred",
          warnings: ["No safe scope candidate"],
        },
        null,
        null,
        {
          status: "not-called",
          suggestedScopes: candidates.map((x) => x.query),
        },
      );
    const unique = dedupeProducts(scoped.products);
    const binder = detectHomepageBinder(homepage);
    let profile: any = null;
    let ai: any = { status: "not-called", attempts: 0 };
    if (request.parserProfile !== undefined) {
      const g = this.deps.parser.validate(request.parserProfile);
      if (g.valid && ["mapping", "builtin"].includes((request.parserProfile as any).kind))
        profile = request.parserProfile;
      else
        ai = {
          status: "explicit-profile-rejected",
          attempts: 0,
          errors: g.errors,
        };
    } else if (binder.detected)
      profile = { kind: "builtin", version: 1, parserType: "binderpos" };
    else if (this.deps.storefront.productsByTitle && !anchorProducts.length) {
      ai = { status: "anchors-insufficient", attempts: 0 };
    } else if (request.aiDiscovery && this.deps.ai) {
      ai = await this.discover(compactEvidence(unique, baseUrl.host), timeoutMs);
      if (ai.envelope) profile = ai.envelope.parserProfile;
    } else
      ai = {
        status: request.aiDiscovery ? "provider-unavailable" : "disabled",
        attempts: 0,
      };
    const validation = profile
      ? this.deps.parser.dryRun(profile, unique, scope)
      : null;
    const identity = validation?.valid && this.deps.identity
      ? await this.deps.identity.evaluate(validation.parsedVariants ?? [])
      : null;
    const identitySummary = summarizeIdentity(identity);
    // A proposal is never safe without the database-backed printing gate.
    // Structural parser coverage alone is useful diagnostics, not onboarding.
    const valid = !!validation?.valid && !!this.deps.identity && identitySummary.valid;
    const status = valid
      ? "proposal-ready"
      : validation?.valid && !this.deps.identity
        ? "database-unavailable"
      : profile
        ? "validation-failed"
        : ai?.transportStatus
          ? "ai-provider-failed"
        : "draft-unavailable";
    const result = this.result(
      status,
      baseUrl,
      apiVersion,
      homepage,
      scope,
      profile,
      validation,
      {
        ...ai,
        binder,
        identity: identitySummary,
        anchors: anchors.map((anchor) => ({
          fixture: anchor.fixture.key,
          query: anchor.query,
          products: anchor.products.length,
          error: anchor.error,
        })),
      },
      request.proposedSlug,
    );
    result.sanitizedFixture = sanitizeFixture(unique, validation);
    return result;
  }
  private async discover(evidence: any, timeoutMs: number) {
    let correctiveErrors: string[] | undefined;
    const diagnostics: any = {
      provider: "groq",
      attempts: 0,
      status: "unavailable",
      promptVersion: 1,
    };
    for (let attempt = 1; attempt <= 2; attempt++) {
      diagnostics.attempts = attempt;
      const response = await this.deps.ai!.discover({
        evidence,
        correctiveErrors,
        timeoutMs,
      });
      if (response.kind === "transport-error") {
        diagnostics.status = response.reason;
        diagnostics.transportStatus = response.status;
        if (attempt === 1 && response.transient) {
          const delay = Math.min(
            5_000,
            Math.max(0, response.retryAfterMs ?? 100),
          );
          if (delay)
            await new Promise<void>((resolve) => setTimeout(resolve, delay));
          continue;
        }
        return diagnostics;
      }
      diagnostics.provider = response.provider ?? "groq";
      diagnostics.model = response.model;
      diagnostics.latencyMs =
        (diagnostics.latencyMs ?? 0) + (response.latencyMs ?? 0);
      let parsed: any;
      try {
        parsed = JSON.parse(response.content);
      } catch {
        correctiveErrors = [
          "Malformed JSON. Return a complete JSON replacement with no markdown.",
        ];
        if (attempt === 1) continue;
        diagnostics.status = "malformed-output";
        return diagnostics;
      }
      if (
        parsed &&
        typeof parsed === "object" &&
        typeof parsed.parserProfileJson === "string" &&
        !parsed.parserProfile
      ) {
        try {
          parsed.parserProfile = JSON.parse(parsed.parserProfileJson);
          delete parsed.parserProfileJson;
        } catch {
          correctiveErrors = [
            "parserProfileJson must be a complete JSON-encoded mapping profile.",
          ];
          if (attempt === 1) continue;
          diagnostics.status = "malformed-output";
          return diagnostics;
        }
      }
      const envelope = validateDraftEnvelope(parsed, (p) =>
        this.deps.parser.validate(p),
      );
      if (!envelope.valid) {
        correctiveErrors = envelope.errors.slice(0, 12);
        if (attempt === 1) continue;
        diagnostics.status = "invalid-output";
        diagnostics.errors = envelope.errors;
        return diagnostics;
      }
      diagnostics.status = "drafted";
      diagnostics.envelope = parsed;
      return diagnostics;
    }
    return diagnostics;
  }
  private result(
    status: string,
    baseUrl: URL,
    apiVersion: string,
    homepage: any,
    scope: ScopeEvidence,
    profile: any,
    validation: any,
    ai: any,
    requestedSlug?: string,
  ) {
    const displayName =
      (profile && ai?.envelope?.storeDisplayName) ||
      baseUrl.hostname.replace(/^www\./, "");
    const name = requestedSlug ?? safeSlug(displayName);
    const proposedStore =
      status === "proposal-ready"
        ? {
            name,
            displayName,
            baseUrl: baseUrl.origin,
            isActive: false,
            platformType: "shopify_storefront",
            scraperType: profile.kind === "builtin" ? "binderpos" : "default",
            rateLimitPerSecond: 15,
            discoveryConfig: { discoveryEnabled: false },
            scraperConfig: {
              shopifyUrl: baseUrl.host,
              storefrontApiVersion: apiVersion,
              source: {
                kind: "storefront-graphql",
                mode: "products-query",
                productQuery: scope.query,
              },
              // Kept only so mixed-version workers can read a newly reviewed
              // disabled proposal during the source-strategy migration.
              storefrontScope: scope.query,
              parser: profile,
            },
          }
        : null;
    return {
      status,
      probeOnly: true,
      approvalRequired: true,
      input: { url: baseUrl.toString(), proposedSlug: requestedSlug },
      detection: {
        platform:
          homepage?.signals?.shopifyGlobal ||
          homepage?.signals?.shopifyCdn ||
          homepage?.ok
            ? "shopify"
            : "unknown",
        homepage,
        endpointHost: baseUrl.host,
        apiVersion,
      },
      scope,
      ai,
      validation,
      proposedStore,
      duplicateLookupKeys: { name, baseUrl: baseUrl.origin },
    };
  }
}
function summarizeIdentity(identity: IdentityEvaluation[] | null) {
  if (!identity) return { status: "not-run", valid: false };
  const counts = identity.reduce<Record<string, number>>(
    (result, item) => ((result[item.outcome] = (result[item.outcome] ?? 0) + 1), result),
    {},
  );
  const exact = counts["exact-printing"] ?? 0;
  const nonToken = identity.length - (counts.token ?? 0);
  const coverage = nonToken ? exact / nonToken : 0;
  return {
    status: "verified",
    valid: identity.length >= 100 && coverage >= 0.9 && !(counts.ambiguous ?? 0) && !(counts.unmatched ?? 0),
    sampledVariants: identity.length,
    exactPrinting: exact,
    token: counts.token ?? 0,
    ambiguous: counts.ambiguous ?? 0,
    unmatched: counts.unmatched ?? 0,
    coverage,
  };
}
function dedupeProducts(products: any[]) {
  const seen = new Set<string>();
  return products.map((p) => ({
    ...p,
    variants: {
      ...p.variants,
      nodes: variants(p).filter((v: any) => {
        const id = String(v.id ?? "");
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      }),
    },
  }));
}
function sanitizeFixture(products: any[], validation: any) {
  const rejected = new Map(
    (validation?.rejections ?? []).map((x: any) => [x.variantId, x.errors]),
  );
  const out: any[] = [];
  for (const p of products)
    for (const v of variants(p)) {
      out.push({
        product: {
          id: String(p.id ?? "").slice(-50),
          title: String(p.title ?? "").slice(0, 240),
          vendor: String(p.vendor ?? "").slice(0, 120),
          productType: String(p.productType ?? "").slice(0, 120),
          tags: tags(p).slice(0, 12),
        },
        variant: {
          id: String(v.id ?? "").slice(-60),
          title: String(v.title ?? "").slice(0, 160),
          sku: String(v.sku ?? "").slice(0, 160),
          price: v.price,
          selectedOptions: (v.selectedOptions ?? []).slice(0, 5),
        },
        outcome: rejected.has(v.id) ? "rejected" : "accepted",
        errors: rejected.get(v.id) ?? [],
      });
      if (out.length >= 100) return out;
    }
  return out;
}
