import {
  STOREFRONT_MAPPING_PROFILE_JSON_SCHEMA,
  normalizeStorefrontMappingProfileDraft,
} from "../../packages/shared/dist/index.js";

/** Strict onboarding envelope composed with the shared closed mapping-profile schema. */
export const MAPPING_DRAFT_ENVELOPE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "storeDisplayName",
    "parserProfile",
    "fieldRationale",
    "gaps",
    "requiresHumanReview",
  ],
  properties: {
    schemaVersion: { const: 1 },
    storeDisplayName: { type: "string", minLength: 1, maxLength: 100 },
    parserProfile: STOREFRONT_MAPPING_PROFILE_JSON_SCHEMA,
    fieldRationale: {
      type: "array",
      maxItems: 7,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["field", "sources", "rationale", "confidence"],
        properties: {
          field: {
            enum: [
              "cardName",
              "setName",
              "setCode",
              "collectorNumber",
              "condition",
              "foil",
              "isToken",
            ],
          },
          sources: { type: "array", items: { type: "string" }, maxItems: 8 },
          rationale: { type: "string", maxLength: 500 },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
      },
    },
    gaps: {
      type: "array",
      items: { type: "string", maxLength: 500 },
      maxItems: 30,
    },
    requiresHumanReview: { const: true },
  },
} as const;

const fields = new Set([
  "cardName",
  "setName",
  "setCode",
  "collectorNumber",
  "condition",
  "foil",
  "isToken",
]);
export function validateDraftEnvelope(
  value: any,
  validateProfile: (profile: unknown) => { valid: boolean; errors: string[] },
) {
  const errors: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value))
    errors.push("envelope must be an object");
  else {
    const allowed = new Set(
      Object.keys(MAPPING_DRAFT_ENVELOPE_SCHEMA.properties),
    );
    for (const key of Object.keys(value))
      if (!allowed.has(key)) errors.push(`envelope.${key}: unknown property`);
    if (value.schemaVersion !== 1) errors.push("schemaVersion must be 1");
    if (
      typeof value.storeDisplayName !== "string" ||
      !value.storeDisplayName.trim() ||
      value.storeDisplayName.length > 100 ||
      /[\r\n<>]/.test(value.storeDisplayName)
    )
      errors.push("invalid storeDisplayName");
    if (value.requiresHumanReview !== true)
      errors.push("requiresHumanReview must be true");
    if (
      !Array.isArray(value.gaps) ||
      value.gaps.some((x: unknown) => typeof x !== "string")
    )
      errors.push("gaps must be string array");
    if (!Array.isArray(value.fieldRationale))
      errors.push("fieldRationale must be an array");
    else
      for (const item of value.fieldRationale)
        if (
          !item ||
          typeof item !== "object" ||
          !fields.has(item.field) ||
          !Array.isArray(item.sources) ||
          typeof item.rationale !== "string" ||
          typeof item.confidence !== "number" ||
          item.confidence < 0 ||
          item.confidence > 1 ||
          Object.keys(item).some(
            (k) => !["field", "sources", "rationale", "confidence"].includes(k),
          )
        )
          errors.push("invalid fieldRationale entry");
    if (
      !value.parserProfile ||
      value.parserProfile.kind !== "mapping" ||
      value.parserProfile.version !== 1
    )
      errors.push("parserProfile must be a version-1 mapping profile");
    else {
      value.parserProfile = normalizeStorefrontMappingProfileDraft(
        value.parserProfile,
      );
      errors.push(...validateProfile(value.parserProfile).errors);
    }
  }
  return { valid: !errors.length, errors };
}
