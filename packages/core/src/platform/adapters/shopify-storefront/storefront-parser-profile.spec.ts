import { describe, expect, it } from "vitest";
import {
  evaluateStorefrontParserProfile,
  normalizeStorefrontProfileInputs,
  validateStorefrontParserProfile,
  validateStorefrontParserProfileGrammar,
  validateStorefrontMappingProfileContract,
} from "@scoutlgs/shared";
import { ProfiledStorefrontCardParser } from "./profiled-storefront-card-parser";

const input = {
  product: {
    title: "  Lightning Bolt [M11] (Foil)  ",
    vendor: "Magic 2011",
    productType: "MTG Single",
    descriptionHtml: "<p>collector: 123</p>",
    tags: ["Magic", "Set:M11", "English"],
    handle: "lightning-bolt",
    onlineStoreUrl: "https://example.test/products/lightning-bolt",
    availableForSale: true,
    images: [{ url: "https://example.test/bolt.jpg" }],
  },
  variant: {
    id: "gid://shopify/ProductVariant/1",
    title: "Near Mint",
    sku: "M11-123-EN-FO",
    availableForSale: true,
    price: { amount: "2.50", currencyCode: "CAD" },
    selectedOptions: [
      { name: "Condition", value: "Near Mint" },
      { name: "Finish", value: "Foil" },
    ],
  },
} as const;

const profile = (source: string, transform: object) => ({
  kind: "mapping" as const,
  version: 1 as const,
  fields: { cardName: { candidates: [{ source, transforms: [transform] }] } },
});

describe("Storefront parser profile grammar", () => {
  it.each([
    ["trim", "product.title", { type: "trim" }, "Lightning Bolt [M11] (Foil)"],
    ["lowercase", "product.vendor", { type: "lowercase" }, "magic 2011"],
    ["uppercase", "product.vendor", { type: "uppercase" }, "MAGIC 2011"],
    ["before", "variant.sku", { type: "before", value: "-" }, "M11"],
    ["after", "variant.sku", { type: "after", value: "M11-" }, "123-EN-FO"],
    [
      "split",
      "variant.sku",
      { type: "split", delimiter: "-", index: 1 },
      "123",
    ],
    [
      "bracketGroup",
      "product.title",
      { type: "bracketGroup", index: 0 },
      "M11",
    ],
    [
      "parenthesisGroup",
      "product.title",
      { type: "parenthesisGroup", index: 0 },
      "Foil",
    ],
    [
      "regexCapture",
      "variant.sku",
      { type: "regexCapture", pattern: "^([A-Z0-9]+)-", group: 1 },
      "M11",
    ],
    [
      "regexReplace",
      "variant.sku",
      { type: "regexReplace", pattern: "-EN-", replacement: "-" },
      "M11-123-FO",
    ],
    [
      "stripTokens",
      "product.title",
      { type: "stripTokens", values: ["[M11]", "(Foil)"] },
      "Lightning Bolt",
    ],
    [
      "optionValue",
      "variant.selectedOptions",
      { type: "optionValue", name: "condition" },
      "Near Mint",
    ],
    [
      "tagValue exact",
      "product.tags",
      { type: "tagValue", mode: "exact", value: "magic" },
      "Magic",
    ],
    [
      "tagValue prefix",
      "product.tags",
      { type: "tagValue", mode: "prefix", value: "set:" },
      "Set:M11",
    ],
    [
      "tagValue contains",
      "product.tags",
      { type: "tagValue", mode: "contains", value: "ngl" },
      "English",
    ],
    [
      "tagValue firstExcluding",
      "product.tags",
      { type: "tagValue", mode: "firstExcluding", exclude: ["magic", "set:"] },
      "English",
    ],
    ["condition", "variant.title", { type: "condition" }, "nm"],
    [
      "map",
      "product.vendor",
      { type: "map", values: { "magic 2011": "M11" } },
      "M11",
    ],
  ])("%s resolves deterministically", (_name, source, transform, expected) => {
    expect(
      evaluateStorefrontParserProfile(
        profile(source, transform) as any,
        input as any,
      ).cardName,
    ).toBe(expected);
  });

  it("normalizes booleanTokens with false taking precedence", () => {
    const mapping: any = {
      kind: "mapping",
      version: 1,
      fields: {
        cardName: { candidates: [{ value: "Bolt" }] },
        foil: {
          candidates: [
            {
              source: "variant.selectedOptions",
              transforms: [
                { type: "optionValue", name: "Finish" },
                { type: "booleanTokens", true: ["foil"], false: ["foil"] },
              ],
            },
          ],
        },
      },
    };
    expect(evaluateStorefrontParserProfile(mapping, input as any).foil).toBe(
      false,
    );
  });

  it("honours predicates, candidate fallback, and boolean false", () => {
    const tested = {
      kind: "mapping" as const,
      version: 1 as const,
      fields: {
        cardName: {
          candidates: [
            {
              value: "wrong",
              when: [
                { source: "product.vendor", operator: "equals", value: "Nope" },
              ],
            },
            { source: "product.title", transforms: [{ type: "trim" }] },
          ],
        },
        foil: { candidates: [{ value: false }] },
      },
    };
    expect(evaluateStorefrontParserProfile(tested, input as any)).toEqual({
      cardName: "Lightning Bolt [M11] (Foil)",
      foil: false,
    });
  });

  it.each([
    "equals",
    "notEquals",
    "contains",
    "notContains",
    "regex",
    "isEmpty",
    "notEmpty",
  ] as const)("supports %s predicates", (operator) => {
    const value =
      operator === "equals"
        ? "Magic 2011"
        : operator === "notContains"
          ? "sealed"
          : operator === "isEmpty"
            ? ""
            : operator === "regex"
              ? undefined
              : "magic";
    const predicate: any = {
      source: operator === "isEmpty" ? "variant.sku" : "product.vendor",
      operator,
      value,
      pattern: "magic",
      flags: "i",
    };
    if (operator === "isEmpty") predicate.source = "product.onlineStoreUrl";
    const result = evaluateStorefrontParserProfile(
      {
        kind: "mapping",
        version: 1,
        fields: {
          cardName: {
            candidates: [
              { value: "matched", when: [predicate] },
              { value: "fallback" },
            ],
          },
        },
      },
      input as any,
    );
    expect(result.cardName).toBe(
      operator === "isEmpty" ? "fallback" : "matched",
    );
  });

  it("normalizes connection edges and nodes into identical profile inputs", () => {
    const product = {
      ...input.product,
      images: { nodes: input.product.images },
      variants: { nodes: [input.variant] },
    };
    const edges = {
      ...product,
      images: { edges: input.product.images.map((node) => ({ node })) },
      variants: { edges: [{ node: input.variant }] },
    };
    expect(normalizeStorefrontProfileInputs(edges as any)).toEqual(
      normalizeStorefrontProfileInputs(product as any),
    );
  });

  it("validates malformed profiles and profile sample requirements", () => {
    expect(
      validateStorefrontParserProfile({
        kind: "mapping",
        version: 2,
        fields: {},
      }).valid,
    ).toBe(false);
    expect(
      validateStorefrontParserProfile({
        kind: "mapping",
        version: 1,
        fields: { cardName: { candidates: [{ source: "nope" }] } },
      }).valid,
    ).toBe(false);
    expect(
      validateStorefrontParserProfile({
        kind: "mapping",
        version: 1,
        fields: {
          cardName: {
            candidates: [
              {
                source: "product.title",
                transforms: [{ type: "regexCapture", pattern: "(", group: 1 }],
              },
            ],
          },
        },
      }).valid,
    ).toBe(false);
    expect(
      validateStorefrontParserProfile(
        {
          kind: "mapping",
          version: 1,
          fields: { cardName: { candidates: [{ source: "product.title" }] } },
        },
        [input as any],
      ).valid,
    ).toBe(false);
  });

  it("separates grammar from the production mapping contract and rejects unknown keys", () => {
    const incomplete = {
      kind: "mapping",
      version: 1,
      fields: { cardName: { candidates: [{ value: "Bolt" }] } },
    };
    expect(validateStorefrontParserProfileGrammar(incomplete).valid).toBe(true);
    expect(validateStorefrontMappingProfileContract(incomplete).valid).toBe(
      false,
    );
    expect(
      validateStorefrontParserProfileGrammar({
        ...incomplete,
        unexpected: true,
      }).valid,
    ).toBe(false);
    expect(
      validateStorefrontParserProfileGrammar({
        kind: "mapping",
        version: 1,
        fields: { cardName: { candidates: [{ value: "Bolt", nope: true }] } },
      }).valid,
    ).toBe(false);
  });

  it("fails closed with every missing required output", () => {
    const mapping: any = {
      kind: "mapping",
      version: 1,
      fields: {
        cardName: { candidates: [{ value: "" }] },
        setName: { candidates: [{ value: "" }] },
        condition: { candidates: [{ value: "unknown" }] },
        foil: {
          candidates: [
            { source: "variant.title", transforms: [{ type: "foil" }] },
          ],
        },
        isToken: { candidates: [{ value: false }] },
      },
    };
    const result = ProfiledStorefrontCardParser.parse(
      mapping,
      {
        ...input,
        variant: {
          ...input.variant,
          id: "",
          price: { amount: "-1", currencyCode: "" },
        },
      } as any,
      "https://example.test",
    );
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.failures.map((failure) => failure.code)).toEqual([
        "missing-card-name",
        "missing-set-identity",
        "unknown-condition",
        "unknown-finish",
        "invalid-price",
        "missing-currency",
        "missing-variant-id",
      ]);
  });

  it("applies Art Series exclusions with product and all-variant scope", () => {
    const mapping: any = {
      kind: "mapping",
      version: 1,
      fields: { cardName: { candidates: [{ source: "product.title" }] } },
      exclusions: [
        {
          reason: "art-series",
          scope: "product",
          predicate: {
            source: "product.tags",
            operator: "contains",
            value: "magic",
          },
        },
      ],
    };
    expect(
      ProfiledStorefrontCardParser.isArtSeries(mapping, [input as any]),
    ).toBe(true);
    mapping.exclusions[0] = {
      reason: "art-series",
      scope: "allVariants",
      predicate: {
        source: "variant.title",
        operator: "equals",
        value: "Near Mint",
      },
    };
    expect(
      ProfiledStorefrontCardParser.isArtSeries(mapping, [input as any]),
    ).toBe(true);
  });
});
