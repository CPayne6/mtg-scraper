import { describe, expect, it } from "vitest";
import {
  normalizeStorefrontHost,
  validateStorefrontStoreConfig,
} from "./storefront-config";

describe("Storefront configuration normalization", () => {
  it.each([
    ["shop.example.com", "shop.example.com"],
    ["SHOP.Example.COM:8443", "shop.example.com:8443"],
    ["https://legacy.example.com/", "legacy.example.com"],
  ])("normalizes %s", (value, expected) =>
    expect(normalizeStorefrontHost(value, "https://base.example.com")).toBe(
      expected,
    ),
  );
  it("falls back to the customer-facing base URL host", () =>
    expect(
      normalizeStorefrontHost(undefined, "https://shop.example.com/"),
    ).toBe("shop.example.com"));
  it.each([
    "https://shop.example.com/path",
    "https://user:pass@shop.example.com",
    "shop.example.com/path",
    "shop.example.com?q=x",
    "shop.example.com#x",
    "ftp://shop.example.com",
    "shop example.com",
  ])("rejects malformed host %s", (value) =>
    expect(() =>
      normalizeStorefrontHost(value, "https://base.example.com"),
    ).toThrow(),
  );
  it("validates the normalized production contract", () => {
    const result = validateStorefrontStoreConfig({
      baseUrl: "https://shop.example.com",
      platformType: "shopify_storefront",
      rateLimitPerSecond: 2,
      scraperConfig: {
        shopifyUrl: "https://SHOP.example.com/",
        storefrontApiVersion: "2026-01",
        storefrontScope: 'product_type:"MTG Single"',
        parser: {
          kind: "mapping",
          version: 1,
          fields: {
            cardName: { candidates: [{ value: "Bolt" }] },
            setName: { candidates: [{ value: "M11" }] },
            condition: { candidates: [{ value: "nm" }] },
            foil: { candidates: [{ value: false }] },
            isToken: { candidates: [{ value: false }] },
          },
        },
      },
    } as any);
    expect(result).toMatchObject({
      valid: true,
      config: { shopifyUrl: "shop.example.com" },
    });
  });
});
