import { afterEach, describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import {
  inferScopeFromStorefrontProducts,
  main as probeMain,
  parseArgs as parseProbeArgs,
  tryStorefrontApi,
  tryStorefrontProductsByTitle,
  validateMappingDraft,
} from "./probe-storefront-store.ts";
import {
  StorefrontOnboardingService,
  compactEvidence,
  collectAnchorObservations,
  detectHomepageBinder,
} from "./storefront-onboarding/service.ts";
import { productionParserAdapter } from "./storefront-onboarding/production-parser-adapter.ts";
import {
  inferScopeFromListings,
  parseArgs as parseVerificationArgs,
  postJson,
} from "./verify-storefront-listing-data.ts";
import { validateStorefrontParserProfile } from "../packages/shared/dist/storefront-parser-profile.js";

const originalArgv = process.argv;

afterEach(() => {
  process.argv = originalArgv;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("storefront onboarding scripts", () => {
  it("executes both CLIs through tsx and prints their help", () => {
    for (const script of [
      "probe-storefront-store.ts",
      "verify-storefront-listing-data.ts",
    ]) {
      const result = spawnSync(
        process.execPath,
        [
          resolve("node_modules/tsx/dist/cli.mjs"),
          resolve("scripts", script),
          "--help",
        ],
        { encoding: "utf8" },
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toContain("Usage:");
    }
  });

  it("loads the probe against the compiled CommonJS shared module", () => {
    expect(
      parseProbeArgs(["--url", "https://example.test", "--no-ai-discovery"])
        .url,
    ).toBe("https://example.test");
  });

  it("validates probe and verification arguments", () => {
    expect(() => parseProbeArgs([])).toThrow("--url is required");
    expect(parseProbeArgs(["--help"]).help).toBe(true);
    expect(() =>
      parseProbeArgs(["--url", "https://example.test", "--approve"]),
    ).toThrow("--approve requires --output");
    expect(() =>
      parseProbeArgs([
        "--url",
        "https://example.test",
        "--output",
        "proposal.json",
      ]),
    ).toThrow("--output requires --approve");
    expect(
      parseProbeArgs([
        "--url",
        "https://example.test",
        "--parser-profile",
        "fixtures/example.json",
      ])["parser-profile"],
    ).toBe("fixtures/example.json");
    expect(() => parseVerificationArgs(["--url"])).toThrow(
      "Missing value for --url",
    );
    expect(() => parseVerificationArgs([])).toThrow("--url is required");
    expect(parseVerificationArgs(["--help"]).help).toBe(true);
  });

  it("uses a tokenless Storefront request and accepts public GraphQL products", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            products: {
              nodes: [
                {
                  id: "p1",
                  title: "Lightning Bolt [LEA]",
                  productType: "MTG Singles",
                  vendor: "Magic",
                  tags: ["MTG"],
                  variants: {
                    nodes: [
                      {
                        id: "v1",
                        sku: "LEA-161-EN-NF-1",
                        selectedOptions: [
                          { name: "Condition", value: "Near Mint" },
                        ],
                        price: { amount: "4.99", currencyCode: "CAD" },
                      },
                    ],
                  },
                },
              ],
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await tryStorefrontApi(
      new URL("https://example.test"),
      "2026-04",
      'tag:"MTG"',
      100,
      5,
    );

    expect(result.ok).toBe(true);
    expect(
      fetchMock.mock.calls[0][1].headers["X-Shopify-Storefront-Access-Token"],
    ).toBeUndefined();
  });

  it("uses fixed named-card probes without requiring a catalog scope", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { products: { nodes: [] } } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await tryStorefrontProductsByTitle(
      new URL("https://example.test"), "2026-04", "Urza's Saga", 100,
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).variables.query).toBe(
      'title:"Urza\'s Saga"',
    );

    const observations = await collectAnchorObservations({
      homepage: async () => ({}),
      products: async () => ({ ok: true, endpoint: "", status: 200, products: [] }),
      productsByTitle: async (_url, _api, title) => ({
        ok: true, endpoint: "", status: 200,
        products: title === "Lightning Bolt" ? [{ id: "p1" }] : [],
      }),
    }, new URL("https://example.test"), "2026-04", 100);
    expect(observations).toHaveLength(12);
    expect(observations[0].products).toHaveLength(1);
  });

  it("requires multiple independent homepage signals for BinderPOS", () => {
    expect(detectHomepageBinder({ signals: { binderScript: true } }).detected).toBe(false);
    expect(detectHomepageBinder({ signals: { binderScript: true, binderProductData: true } })).toMatchObject({
      detected: true,
      evidence: ["binderScript", "binderProductData"],
    });
  });

  it("reports GraphQL rejection and request timeout failures without proposing an unsafe scope", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ errors: [{ message: "access denied" }] }),
            { status: 401 },
          ),
        ),
    );
    await expect(
      postJson("https://example.test/graphql", {}, 100),
    ).rejects.toThrow("HTTP 401");

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(
          (_url, init) =>
            new Promise((_resolve, reject) =>
              init.signal.addEventListener("abort", () =>
                reject(new Error("request aborted")),
              ),
            ),
        ),
    );
    const timedOut = await tryStorefrontApi(
      new URL("https://example.test"),
      "2026-04",
      null,
      5,
    );
    expect(timedOut.ok).toBe(false);
    expect(timedOut.error).toContain("request aborted");
    expect(
      inferScopeFromStorefrontProducts([
        { productType: "Accessories", vendor: "Board Games", tags: [] },
      ]),
    ).toMatchObject({ ok: false, strategy: "none" });
  });

  it("rejects unsafe inferred listing scopes and invalid parser profiles", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              products: [
                {
                  product_type: "Accessories",
                  vendor: "Board Games",
                  tags: "",
                },
              ],
            }),
            { status: 200 },
          ),
        ),
    );
    await expect(
      inferScopeFromListings(new URL("https://example.test"), 100),
    ).rejects.toThrow("Could not infer an MTG singles scope");
    expect(
      validateStorefrontParserProfile({
        kind: "mapping",
        version: 1,
        fields: { cardName: { candidates: [] } },
      }),
    ).toMatchObject({ valid: false });
  });

  it("prefers an explicit singles tag over a broad MTG brand tag", () => {
    expect(
      inferScopeFromStorefrontProducts([
        {
          productType: "",
          vendor: "Example",
          tags: ["Brands:Magic The Gathering", "MTG Singles"],
        },
      ]),
    ).toMatchObject({
      ok: true,
      strategy: "explicit-mtg-singles-tag",
      query: 'tag:"MTG Singles"',
    });
  });

  it("keeps the default probe path read-only", async () => {
    const fetchMock = vi.fn().mockImplementation((url, init = {}) => {
      if (init.method === "POST")
        return Promise.resolve(
          new Response(JSON.stringify({ data: { products: { nodes: [] } } }), {
            status: 200,
          }),
        );
      return Promise.resolve(
        new Response("<html><title>Example</title></html>", { status: 200 }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    process.argv = [
      "node",
      "probe-storefront-store.ts",
      "--url",
      "https://example.test",
      "--no-ai-discovery",
    ];

    await probeMain();

    const report = JSON.parse(log.mock.calls[0][0]);
    expect(report).toMatchObject({
      probeOnly: true,
      approvalRequired: true,
      proposedStore: null,
    });
    expect(
      fetchMock.mock.calls.every(
        ([, init = {}]) =>
          init.method !== "PUT" &&
          init.method !== "PATCH" &&
          init.method !== "DELETE",
      ),
    ).toBe(true);
  });

  it("requires 100 scoped, valid mapping variants before admitting a draft", () => {
    const profile = {
      kind: "mapping",
      version: 1,
      fields: {
        cardName: { candidates: [{ source: "product.title" }] },
        setName: { candidates: [{ source: "product.vendor" }] },
        condition: {
          candidates: [
            {
              source: "variant.selectedOptions",
              transforms: [
                { type: "optionValue", name: "Condition" },
                { type: "condition" },
              ],
            },
          ],
        },
        foil: { candidates: [{ value: false }] },
        isToken: { candidates: [{ value: false }] },
      },
    };
    const product = (count: number, condition = "Near Mint") => ({
      title: "Lightning Bolt",
      vendor: "Alpha",
      productType: "MTG Singles",
      descriptionHtml: "",
      tags: ["MTG Singles"],
      handle: "bolt",
      availableForSale: true,
      images: { nodes: [] },
      variants: {
        nodes: Array.from({ length: count }, (_, index) => ({
          id: `v${index}`,
          title: condition,
          sku: "A-1",
          availableForSale: true,
          price: { amount: "1.00", currencyCode: "CAD" },
          selectedOptions: [{ name: "Condition", value: condition }],
        })),
      },
    });
    const scope = {
      ok: true,
      query: 'tag:"MTG Singles"',
      strategy: "explicit-mtg-singles-tag",
      evidence: { tag: "MTG Singles" },
    };
    expect(validateMappingDraft(profile, [product(100)], scope)).toMatchObject({
      valid: true,
      validVariants: 100,
    });
    expect(validateMappingDraft(profile, [product(99)], scope)).toMatchObject({
      valid: false,
      validVariants: 99,
    });
    expect(
      validateMappingDraft(profile, [product(100, "Minty")], scope),
    ).toMatchObject({ valid: false, fieldFailures: { condition: 100 } });
    expect(
      validateMappingDraft(profile, [product(100)], { ok: false }),
    ).toMatchObject({ valid: false });
  });
});

describe("StorefrontOnboardingService gates", () => {
  const profile = {
    kind: "mapping",
    version: 1,
    fields: {
      cardName: { candidates: [{ source: "product.title" }] },
      setName: { candidates: [{ source: "product.vendor" }] },
      condition: {
        candidates: [
          {
            source: "variant.selectedOptions",
            transforms: [
              { type: "optionValue", name: "Condition" },
              { type: "condition" },
            ],
          },
        ],
      },
      foil: { candidates: [{ value: false }] },
      isToken: { candidates: [{ value: false }] },
    },
  };
  const product = (count = 100, condition = "Near Mint") => ({
    id: "p1",
    title: "Lightning Bolt [Alpha]",
    vendor: "Alpha",
    productType: "MTG Singles",
    descriptionHtml: "<b>data</b>",
    tags: ["MTG Singles"],
    handle: "bolt",
    availableForSale: true,
    images: { nodes: [] },
    variants: {
      nodes: Array.from({ length: count }, (_, i) => ({
        id: `v${i}`,
        title: condition,
        sku: `A-${i}`,
        availableForSale: true,
        price: { amount: "1.00", currencyCode: "CAD" },
        selectedOptions: [{ name: "Condition", value: condition }],
      })),
    },
  });
  function service(products: any[], ai?: any) {
    return new StorefrontOnboardingService({
      storefront: {
        homepage: async () => ({ ok: true, signals: { shopifyCdn: true } }),
        products: async (_u, _v, scope) => ({
          ok: true,
          endpoint: "https://example.test/api",
          status: 200,
          products: scope === null ? products : products,
        }),
      },
      parser: productionParserAdapter(),
      identity: {
        evaluate: async (variants) => variants.map((variant) => ({
          productId: variant.productId,
          variantId: variant.variantId,
          outcome: "exact-printing" as const,
          cardPrintingId: 1,
          cardNameId: 1,
        })),
      },
      ai,
    });
  }
  const envelope = (p = profile) =>
    JSON.stringify({
      schemaVersion: 1,
      storeDisplayName: "Example Store",
      parserProfile: p,
      fieldRationale: [
        {
          field: "cardName",
          sources: ["product.title"],
          rationale: "present",
          confidence: 1,
        },
      ],
      gaps: [],
      requiresHumanReview: true,
    });

  it("uses a manual scope only after safety checks, and explicit profile makes no AI call", async () => {
    const ai = { discover: vi.fn() };
    const result = await service([product()], ai).onboard({
      url: "https://example.test/x?q=secret",
      scope: 'tag:"MTG Singles"',
      parserProfile: profile,
      aiDiscovery: true,
    });
    expect(result).toMatchObject({
      status: "proposal-ready",
      scope: { source: "manual", ok: true },
      proposedStore: {
        isActive: false,
        scraperConfig: { shopifyUrl: "example.test" },
      },
    });
    expect(ai.discover).not.toHaveBeenCalled();
  });
  it("rejects unsafe and empty manual scopes before AI", async () => {
    const ai = { discover: vi.fn() };
    const unsafe = await service(
      [{ ...product(), productType: "Accessories", tags: [] }],
      ai,
    ).onboard({
      url: "https://example.test",
      scope: 'product_type:"Accessories"',
      aiDiscovery: true,
    });
    expect(unsafe.status).toBe("scope-required");
    expect(ai.discover).not.toHaveBeenCalled();
  });
  it("makes one corrective request for malformed output and never more than two requests", async () => {
    const ai = {
      discover: vi
        .fn()
        .mockResolvedValueOnce({ kind: "success", content: "{" })
        .mockResolvedValueOnce({ kind: "success", content: envelope() }),
    };
    const result = await service([product()], ai).onboard({
      url: "https://example.test",
      aiDiscovery: true,
    });
    expect(result.status).toBe("proposal-ready");
    expect(ai.discover).toHaveBeenCalledTimes(2);
    expect(ai.discover.mock.calls[1][0].correctiveErrors[0]).toContain(
      "Malformed",
    );
  });
  it("decodes a strict-provider parserProfileJson envelope before validation", async () => {
    const strictEnvelope = JSON.stringify({
      schemaVersion: 1,
      storeDisplayName: "Example Store",
      parserProfileJson: JSON.stringify(profile),
      fieldRationale: [
        {
          field: "cardName",
          sources: ["product.title"],
          rationale: "present",
          confidence: 1,
        },
      ],
      gaps: [],
      requiresHumanReview: true,
    });
    const ai = {
      discover: vi.fn().mockResolvedValue({
        kind: "success",
        content: strictEnvelope,
      }),
    };
    const result = await service([product()], ai).onboard({
      url: "https://example.test",
      aiDiscovery: true,
    });
    expect(result.status).toBe("proposal-ready");
    expect(result.ai.attempts).toBe(1);
  });
  it("uses the second and final request for transient provider failure", async () => {
    const ai = {
      discover: vi
        .fn()
        .mockResolvedValueOnce({
          kind: "transport-error",
          status: 429,
          reason: "rate limited",
          transient: true,
        })
        .mockResolvedValueOnce({ kind: "success", content: envelope() }),
    };
    const result = await service([product()], ai).onboard({
      url: "https://example.test",
      aiDiscovery: true,
    });
    expect(result.status).toBe("proposal-ready");
    expect(ai.discover).toHaveBeenCalledTimes(2);
  });
  it("fails closed on a non-retryable AI provider response", async () => {
    const ai = {
      discover: vi.fn().mockResolvedValue({
        kind: "transport-error",
        status: 400,
        reason: "provider HTTP 400: invalid request",
        transient: false,
      }),
    };
    const result = await service([product()], ai).onboard({
      url: "https://example.test",
      aiDiscovery: true,
    });
    expect(result.status).toBe("ai-provider-failed");
    expect(result.proposedStore).toBeNull();
    expect(result.ai).toMatchObject({
      transportStatus: 400,
      status: "provider HTTP 400: invalid request",
    });
    expect(ai.discover).toHaveBeenCalledTimes(1);
  });
  it("rejects builtin and malformed drafts and honors 99/100 plus 95% coverage boundaries", async () => {
    const bad = JSON.stringify({
      schemaVersion: 1,
      storeDisplayName: "x",
      parserProfile: { kind: "builtin", version: 1, parserType: "f2f" },
      fieldRationale: [],
      gaps: [],
      requiresHumanReview: true,
    });
    const ai = {
      discover: vi.fn().mockResolvedValue({ kind: "success", content: bad }),
    };
    expect(
      (
        await service([product()], ai).onboard({
          url: "https://example.test",
          aiDiscovery: true,
        })
      ).status,
    ).toBe("draft-unavailable");
    expect(ai.discover).toHaveBeenCalledTimes(2);
    expect(
      (
        await service([product(99)]).onboard({
          url: "https://example.test",
          parserProfile: profile,
          aiDiscovery: false,
        })
      ).validation.valid,
    ).toBe(false);
    const ninetyFive = product(105);
    ninetyFive.variants.nodes
      .slice(100)
      .forEach((v: any) => (v.selectedOptions[0].value = "unknown"));
    expect(
      (
        await service([ninetyFive]).onboard({
          url: "https://example.test",
          parserProfile: profile,
          aiDiscovery: false,
        })
      ).status,
    ).toBe("proposal-ready");
  });
  it("keeps evidence compact, deterministic and capped at five products and three variants", () => {
    const products = Array.from({ length: 8 }, (_, i) => ({
      ...product(4),
      id: `p${i}`,
      title: `Card ${i} [Set ${i}]`,
      productType: `MTG Singles ${i}`,
      variants: {
        nodes: product(4).variants.nodes.map((v: any, j: number) => ({
          ...v,
          id: `v${i}-${j}`,
        })),
      },
    }));
    const one = compactEvidence(products, "example.test"),
      two = compactEvidence(products, "example.test");
    expect(one).toEqual(two);
    expect(one.storeHost).toBe("example.test");
    expect(one.products).toHaveLength(5);
    expect(one.products.every((p: any) => p.variants.length <= 3)).toBe(true);
  });
});
