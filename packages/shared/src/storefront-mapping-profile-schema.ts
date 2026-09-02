import type { StorefrontParserProfile } from "./storefront-parser-profile";

const sources = [
  "product.title", "product.vendor", "product.productType", "product.descriptionHtml",
  "product.tags", "product.handle", "product.onlineStoreUrl", "product.availableForSale",
  "product.images[0].url", "variant.id", "variant.title", "variant.sku",
  "variant.availableForSale", "variant.price.amount", "variant.price.currencyCode",
  "variant.selectedOptions", "variant.selectedOptions[0].value",
  "variant.selectedOptions[1].value", "variant.selectedOptions[2].value",
] as const;

const predicate = {
  anyOf: [
    ...["equals", "notEquals", "contains", "notContains"].map((operator) => ({
      type: "object", additionalProperties: false,
      required: ["source", "operator", "value"],
      properties: { source: { enum: sources }, operator: { const: operator }, value: { anyOf: [{ type: "string" }, { type: "boolean" }] } },
    })),
    { type: "object", additionalProperties: false, required: ["source", "operator", "pattern", "flags"], properties: {
      source: { enum: sources }, operator: { const: "regex" }, pattern: { type: "string", maxLength: 256 }, flags: { anyOf: [{ const: "i" }, { type: "null" }] },
    } },
    ...["isEmpty", "notEmpty"].map((operator) => ({
      type: "object", additionalProperties: false, required: ["source", "operator"],
      properties: { source: { enum: sources }, operator: { const: operator } },
    })),
  ],
} as const;

const simpleTransforms = ["trim", "lowercase", "uppercase", "condition", "foil"].map((type) => ({
  type: "object", additionalProperties: false, required: ["type"], properties: { type: { const: type } },
}));
const transform = {
  anyOf: [
    ...simpleTransforms,
    ...["before", "after"].map((type) => ({ type: "object", additionalProperties: false, required: ["type", "value"], properties: { type: { const: type }, value: { type: "string" } } })),
    { type: "object", additionalProperties: false, required: ["type", "delimiter", "index"], properties: { type: { const: "split" }, delimiter: { type: "string" }, index: { type: "integer" } } },
    ...["bracketGroup", "parenthesisGroup"].map((type) => ({ type: "object", additionalProperties: false, required: ["type", "index"], properties: { type: { const: type }, index: { type: "integer" } } })),
    { type: "object", additionalProperties: false, required: ["type", "pattern", "group", "flags"], properties: { type: { const: "regexCapture" }, pattern: { type: "string", maxLength: 256 }, group: { type: "integer", minimum: 0 }, flags: { anyOf: [{ const: "i" }, { type: "null" }] } } },
    { type: "object", additionalProperties: false, required: ["type", "pattern", "replacement", "flags"], properties: { type: { const: "regexReplace" }, pattern: { type: "string", maxLength: 256 }, replacement: { type: "string" }, flags: { anyOf: [{ const: "i" }, { type: "null" }] } } },
    { type: "object", additionalProperties: false, required: ["type", "values"], properties: { type: { const: "stripTokens" }, values: { type: "array", maxItems: 30, items: { type: "string" } } } },
    { type: "object", additionalProperties: false, required: ["type", "name"], properties: { type: { const: "optionValue" }, name: { type: "string" } } },
    ...["exact", "prefix", "contains"].map((mode) => ({ type: "object", additionalProperties: false, required: ["type", "mode", "value"], properties: { type: { const: "tagValue" }, mode: { const: mode }, value: { type: "string" } } })),
    { type: "object", additionalProperties: false, required: ["type", "mode", "exclude"], properties: { type: { const: "tagValue" }, mode: { const: "firstExcluding" }, exclude: { type: "array", maxItems: 30, items: { type: "string" } } } },
    { type: "object", additionalProperties: false, required: ["type", "true", "false"], properties: { type: { const: "booleanTokens" }, true: { type: "array", maxItems: 30, items: { type: "string" } }, false: { type: "array", maxItems: 30, items: { type: "string" } } } },
  ],
} as const;

const sourceCandidate = {
  type: "object", additionalProperties: false, required: ["source", "transforms", "when"],
  properties: { source: { enum: sources }, transforms: { type: "array", maxItems: 10, items: transform }, when: { type: "array", maxItems: 10, items: predicate } },
} as const;
const valueCandidate = {
  type: "object", additionalProperties: false, required: ["value", "when"],
  properties: { value: { anyOf: [{ type: "string" }, { type: "boolean" }] }, when: { type: "array", maxItems: 10, items: predicate } },
} as const;
const fieldRule = {
  type: "object", additionalProperties: false, required: ["candidates"],
  properties: { candidates: { type: "array", minItems: 1, maxItems: 10, items: { anyOf: [sourceCandidate, valueCandidate] } } },
} as const;
const nullableRule = { anyOf: [fieldRule, { type: "null" }] } as const;
const fieldNames = ["cardName", "setName", "setCode", "collectorNumber", "condition", "foil", "isToken"] as const;

/** Closed strict-output schema for AI-authored mapping profiles. Null optional fields are removed before runtime validation. */
export const STOREFRONT_MAPPING_PROFILE_JSON_SCHEMA = {
  type: "object", additionalProperties: false, required: ["kind", "version", "fields", "exclusions"],
  properties: {
    kind: { const: "mapping" }, version: { const: 1 },
    fields: {
      type: "object", additionalProperties: false, required: fieldNames,
      properties: Object.fromEntries(fieldNames.map((field) => [field, nullableRule])),
    },
    exclusions: { type: "array", maxItems: 20, items: {
      type: "object", additionalProperties: false, required: ["reason", "scope", "predicate"],
      properties: { reason: { const: "art-series" }, scope: { enum: ["product", "allVariants"] }, predicate },
    } },
  },
} as const;

/** Converts the strict-output nullable representation into the runtime version-1 profile grammar. */
export function normalizeStorefrontMappingProfileDraft(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const profile = JSON.parse(JSON.stringify(value)) as Record<string, any>;
  if (profile.fields && typeof profile.fields === "object") {
    for (const field of fieldNames) if (profile.fields[field] === null) delete profile.fields[field];
    for (const rule of Object.values(profile.fields) as any[]) for (const candidate of rule?.candidates ?? []) {
      for (const item of [...(candidate.when ?? []), ...(candidate.transforms ?? [])]) {
        for (const [key, itemValue] of Object.entries(item)) if (itemValue === null) delete item[key];
      }
    }
  }
  return profile as StorefrontParserProfile;
}
