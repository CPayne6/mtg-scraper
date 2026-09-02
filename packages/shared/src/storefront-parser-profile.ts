/** Serializable Storefront mapping grammar. */
export type BuiltinParserType =
  | "default"
  | "f2f"
  | "401"
  | "hobbies"
  | "binderpos"
  | "cgrealm";
export type ProfileField =
  | "cardName"
  | "setName"
  | "setCode"
  | "collectorNumber"
  | "condition"
  | "foil"
  | "isToken";
export type SourcePath =
  | "product.title"
  | "product.vendor"
  | "product.productType"
  | "product.descriptionHtml"
  | "product.tags"
  | "product.handle"
  | "product.onlineStoreUrl"
  | "product.availableForSale"
  | "product.images[0].url"
  | "variant.id"
  | "variant.title"
  | "variant.sku"
  | "variant.availableForSale"
  | "variant.price.amount"
  | "variant.price.currencyCode"
  | "variant.selectedOptions"
  | "variant.selectedOptions[0].value"
  | "variant.selectedOptions[1].value"
  | "variant.selectedOptions[2].value";
export type Predicate = {
  source: SourcePath;
  operator:
    | "equals"
    | "notEquals"
    | "contains"
    | "notContains"
    | "regex"
    | "isEmpty"
    | "notEmpty";
  value?: string | boolean;
  pattern?: string;
  flags?: "i";
};
export type Transform =
  | { type: "trim" | "lowercase" | "uppercase" | "condition" | "foil" }
  | { type: "before" | "after"; value: string }
  | { type: "split"; delimiter: string; index: number }
  | { type: "bracketGroup" | "parenthesisGroup"; index: number }
  | { type: "regexCapture"; pattern: string; group: number; flags?: "i" }
  | { type: "regexReplace"; pattern: string; replacement: string; flags?: "i" }
  | { type: "stripTokens"; values: string[] }
  | { type: "optionValue"; name: string }
  | {
      type: "tagValue";
      mode: "exact" | "prefix" | "contains" | "firstExcluding";
      value?: string;
      exclude?: string[];
    }
  | { type: "booleanTokens"; true: string[]; false: string[] }
  | { type: "map"; values: Record<string, string | boolean> };
export type Candidate =
  | { source: SourcePath; transforms?: Transform[]; when?: Predicate[] }
  | { value: string | boolean; when?: Predicate[] };
export type FieldRule = { candidates: Candidate[] };
export type ArtSeriesExclusion = {
  reason: "art-series";
  scope: "product" | "allVariants";
  predicate: Predicate;
};
export type StorefrontParserProfile =
  | { kind: "builtin"; version: 1; parserType: BuiltinParserType }
  | {
      kind: "mapping";
      version: 1;
      fields: Partial<Record<ProfileField, FieldRule>>;
      exclusions?: ArtSeriesExclusion[];
    };
/** The traversal strategy is explicit in newly onboarded stores. */
export type StorefrontSource =
  | { kind: "storefront-graphql"; mode: "products-query"; productQuery: string }
  | { kind: "storefront-graphql"; mode: "collection"; collectionHandle: string };
export type StorefrontScraperConfig = {
  shopifyUrl: string;
  storefrontApiVersion: string;
  /** @deprecated Read-only compatibility for pre-source configurations. */
  storefrontScope?: string;
  source?: StorefrontSource;
  parser: StorefrontParserProfile;
  storefrontAccessToken?: string;
};
export type NormalizedStorefrontConfig = Omit<StorefrontScraperConfig, "shopifyUrl" | "source"> & {
  shopifyUrl: string;
  source: StorefrontSource;
};
export type ProfileEvaluationInput = {
  product: {
    title: string;
    vendor: string;
    productType: string;
    descriptionHtml: string;
    tags: string[];
    handle: string;
    onlineStoreUrl?: string;
    availableForSale: boolean;
    images: Array<{ url: string }>;
  };
  variant: {
    id: string;
    title: string;
    sku?: string;
    availableForSale: boolean;
    price: { amount: string; currencyCode: string };
    selectedOptions: Array<{ name: string; value: string }>;
  };
};
/** isToken is metadata only: downstream matching remains card-first with token fallback. */
export type ProfileEvaluationResult = Partial<
  Record<ProfileField, string | boolean>
>;
export type StorefrontProfileProductLike = {
  title: string;
  vendor: string;
  productType: string;
  descriptionHtml: string;
  tags: string[];
  handle: string;
  onlineStoreUrl?: string | null;
  availableForSale: boolean;
  images: {
    edges?: Array<{ node: { url: string } }>;
    nodes?: Array<{ url: string }>;
  };
  variants: {
    edges?: Array<{
      node: Omit<ProfileEvaluationInput["variant"], "sku"> & {
        sku?: string | null;
      };
    }>;
    nodes?: Array<
      Omit<ProfileEvaluationInput["variant"], "sku"> & { sku?: string | null }
    >;
  };
};
const fields: ProfileField[] = [
  "cardName",
  "setName",
  "setCode",
  "collectorNumber",
  "condition",
  "foil",
  "isToken",
];
const sources: SourcePath[] = [
  "product.title",
  "product.vendor",
  "product.productType",
  "product.descriptionHtml",
  "product.tags",
  "product.handle",
  "product.onlineStoreUrl",
  "product.availableForSale",
  "product.images[0].url",
  "variant.id",
  "variant.title",
  "variant.sku",
  "variant.availableForSale",
  "variant.price.amount",
  "variant.price.currencyCode",
  "variant.selectedOptions",
  "variant.selectedOptions[0].value",
  "variant.selectedOptions[1].value",
  "variant.selectedOptions[2].value",
];
const builtins: BuiltinParserType[] = [
  "default",
  "f2f",
  "401",
  "hobbies",
  "binderpos",
  "cgrealm",
];
const missing = Symbol("missing");
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const only = (
  v: Record<string, unknown>,
  keys: string[],
  e: string[],
  p: string,
) =>
  Object.keys(v)
    .filter((k) => !keys.includes(k))
    .forEach((k) => e.push(`${p}.${k}: unknown property`));
export function normalizeStorefrontProfileInputs(
  product: StorefrontProfileProductLike,
): ProfileEvaluationInput[] {
  const images =
      product.images.nodes ?? product.images.edges?.map((x) => x.node) ?? [],
    variants =
      product.variants.nodes ??
      product.variants.edges?.map((x) => x.node) ??
      [];
  const p = {
    title: product.title,
    vendor: product.vendor,
    productType: product.productType,
    descriptionHtml: product.descriptionHtml,
    tags: product.tags,
    handle: product.handle,
    ...(product.onlineStoreUrl
      ? { onlineStoreUrl: product.onlineStoreUrl }
      : {}),
    availableForSale: product.availableForSale,
    images: images.map((x) => ({ url: x.url })),
  };
  return variants.map((v) => {
    const { sku, ...rest } = v;
    return { product: p, variant: { ...rest, ...(sku ? { sku } : {}) } };
  });
}
const source = (i: ProfileEvaluationInput, s: SourcePath): unknown => {
  const p = i.product,
    v = i.variant;
  switch (s) {
    case "product.title":
      return p.title;
    case "product.vendor":
      return p.vendor;
    case "product.productType":
      return p.productType;
    case "product.descriptionHtml":
      return p.descriptionHtml;
    case "product.tags":
      return p.tags;
    case "product.handle":
      return p.handle;
    case "product.onlineStoreUrl":
      return p.onlineStoreUrl;
    case "product.availableForSale":
      return p.availableForSale;
    case "product.images[0].url":
      return p.images[0]?.url;
    case "variant.id":
      return v.id;
    case "variant.title":
      return v.title;
    case "variant.sku":
      return v.sku;
    case "variant.availableForSale":
      return v.availableForSale;
    case "variant.price.amount":
      return v.price.amount;
    case "variant.price.currencyCode":
      return v.price.currencyCode;
    case "variant.selectedOptions":
      return v.selectedOptions;
    case "variant.selectedOptions[0].value":
      return v.selectedOptions[0]?.value;
    case "variant.selectedOptions[1].value":
      return v.selectedOptions[1]?.value;
    case "variant.selectedOptions[2].value":
      return v.selectedOptions[2]?.value;
  }
};
export function matchesStorefrontProfilePredicate(
  p: Predicate,
  i: ProfileEvaluationInput,
): boolean {
  const v = source(i, p.source),
    t = Array.isArray(v) ? v.join(" ") : String(v ?? "");
  switch (p.operator) {
    case "isEmpty":
      return !t.trim();
    case "notEmpty":
      return !!t.trim();
    case "equals":
      return v === p.value;
    case "notEquals":
      return v !== p.value;
    case "contains":
      return t.toLowerCase().includes(String(p.value ?? "").toLowerCase());
    case "notContains":
      return !t.toLowerCase().includes(String(p.value ?? "").toLowerCase());
    case "regex":
      try {
        return new RegExp(p.pattern!, p.flags).test(t.slice(0, 512));
      } catch {
        return false;
      }
  }
}
function apply(v: unknown, r: Transform): unknown | typeof missing {
  if (r.type === "optionValue")
    return Array.isArray(v)
      ? ((v as any[]).find(
          (x) => x.name?.toLowerCase() === r.name.toLowerCase(),
        )?.value ?? missing)
      : missing;
  if (r.type === "tagValue") {
    if (!Array.isArray(v)) return missing;
    const tags = v.filter((x): x is string => typeof x === "string"),
      q = r.value?.toLowerCase();
    if (r.mode === "firstExcluding")
      return (
        tags.find(
          (x) =>
            !(r.exclude ?? []).some((y) =>
              x.toLowerCase().includes(y.toLowerCase()),
            ),
        ) ?? missing
      );
    return (
      tags.find((x) =>
        r.mode === "exact"
          ? x.toLowerCase() === q
          : r.mode === "prefix"
            ? x.toLowerCase().startsWith(q!)
            : x.toLowerCase().includes(q!),
      ) ?? missing
    );
  }
  if (typeof v !== "string") return missing;
  const t = v;
  switch (r.type) {
    case "trim":
      return t.trim();
    case "lowercase":
      return t.toLowerCase();
    case "uppercase":
      return t.toUpperCase();
    case "before": {
      const x = t.indexOf(r.value);
      return x < 0 ? missing : t.slice(0, x);
    }
    case "after": {
      const x = t.indexOf(r.value);
      return x < 0 ? missing : t.slice(x + r.value.length);
    }
    case "split":
      return t.split(r.delimiter)[r.index] ?? missing;
    case "bracketGroup":
      return [...t.matchAll(/\[([^\]]*)\]/g)][r.index]?.[1] ?? missing;
    case "parenthesisGroup":
      return [...t.matchAll(/\(([^)]*)\)/g)][r.index]?.[1] ?? missing;
    case "regexCapture":
      return (
        new RegExp(r.pattern, r.flags).exec(t.slice(0, 512))?.[r.group] ??
        missing
      );
    case "regexReplace":
      return t
        .slice(0, 512)
        .replace(new RegExp(r.pattern, r.flags), r.replacement);
    case "stripTokens":
      return r.values
        .reduce(
          (a, x) =>
            a.replace(
              new RegExp(x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
              "",
            ),
          t,
        )
        .replace(/\s+/g, " ")
        .trim();
    case "condition": {
      const x = t.trim().toLowerCase();
      if (/(?:^|\W)(?:nm|near\s+mint)(?:$|\W)/.test(x)) return "nm";
      if (
        /(?:^|\W)(?:lp|pl|sp|light(?:ly)?\s+played|slightly\s+played)(?:$|\W)/.test(
          x,
        )
      )
        return "lp";
      if (/(?:^|\W)(?:mp|moderately\s+played)(?:$|\W)/.test(x)) return "mp";
      if (/(?:^|\W)(?:hp|heavily\s+played)(?:$|\W)/.test(x)) return "hp";
      if (/(?:^|\W)(?:dmg|damaged)(?:$|\W)/.test(x)) return "dmg";
      return missing;
    }
    case "foil": {
      const x = t.trim().toLowerCase();
      if (/(?:^|\W)(?:non[-\s]?foil|normal|nf)(?:$|\W)/.test(x)) return false;
      if (/(?:^|\W)(?:foil|fo|etched)(?:$|\W)/.test(x)) return true;
      return missing;
    }
    case "booleanTokens": {
      const x = t.trim().toLowerCase();
      if (r.false.some((y) => y.toLowerCase() === x)) return false;
      if (r.true.some((y) => y.toLowerCase() === x)) return true;
      return missing;
    }
    case "map":
      return r.values[t.trim().toLowerCase()] ?? missing;
    default:
      return missing;
  }
}
export function evaluateStorefrontParserProfile(
  p: Extract<StorefrontParserProfile, { kind: "mapping" }>,
  i: ProfileEvaluationInput,
): ProfileEvaluationResult {
  const out: ProfileEvaluationResult = {};
  for (const f of fields)
    for (const c of p.fields[f]?.candidates ?? []) {
      if (c.when?.some((x) => !matchesStorefrontProfilePredicate(x, i)))
        continue;
      let v: unknown = "source" in c ? source(i, c.source) : c.value;
      for (const r of "source" in c ? (c.transforms ?? []) : []) {
        v = apply(v, r);
        if (v === missing) break;
      }
      if (
        v === missing ||
        (["foil", "isToken"].includes(f)
          ? typeof v !== "boolean"
          : typeof v !== "string")
      )
        continue;
      out[f] = v as string | boolean;
      break;
    }
  return out;
}
export type StorefrontParserProfileValidation = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};
function regex(v: Record<string, unknown>, e: string[], p: string) {
  if (
    typeof v.pattern !== "string" ||
    v.pattern.length > 256 ||
    (v.flags !== undefined && v.flags !== "i")
  ) {
    e.push(`${p}: invalid regex`);
    return;
  }
  try {
    new RegExp(v.pattern, v.flags as string | undefined);
  } catch {
    e.push(`${p}: invalid regex`);
  }
}
function predicate(v: unknown, e: string[], p: string) {
  if (!record(v)) {
    e.push(`${p}: invalid predicate`);
    return;
  }
  only(v, ["source", "operator", "value", "pattern", "flags"], e, p);
  if (
    !sources.includes(v.source as SourcePath) ||
    ![
      "equals",
      "notEquals",
      "contains",
      "notContains",
      "regex",
      "isEmpty",
      "notEmpty",
    ].includes(v.operator as string)
  )
    e.push(`${p}: invalid predicate`);
  else if (v.operator === "regex") regex(v, e, p);
}
function transform(v: unknown, e: string[], p: string) {
  if (!record(v) || typeof v.type !== "string") {
    e.push(`${p}: unknown transform`);
    return;
  }
  const types = [
    "trim",
    "lowercase",
    "uppercase",
    "condition",
    "foil",
    "before",
    "after",
    "split",
    "bracketGroup",
    "parenthesisGroup",
    "regexCapture",
    "regexReplace",
    "stripTokens",
    "optionValue",
    "tagValue",
    "booleanTokens",
    "map",
  ];
  if (!types.includes(v.type)) {
    e.push(`${p}: unknown transform`);
    return;
  }
  const allowed: any = {
    before: ["type", "value"],
    after: ["type", "value"],
    split: ["type", "delimiter", "index"],
    bracketGroup: ["type", "index"],
    parenthesisGroup: ["type", "index"],
    regexCapture: ["type", "pattern", "group", "flags"],
    regexReplace: ["type", "pattern", "replacement", "flags"],
    stripTokens: ["type", "values"],
    optionValue: ["type", "name"],
    tagValue: ["type", "mode", "value", "exclude"],
    booleanTokens: ["type", "true", "false"],
    map: ["type", "values"],
  };
  only(v, allowed[v.type] ?? ["type"], e, p);
  if (["before", "after"].includes(v.type) && typeof v.value !== "string")
    e.push(`${p}: value required`);
  if (
    v.type === "split" &&
    (typeof v.delimiter !== "string" || !Number.isInteger(v.index))
  )
    e.push(`${p}: delimiter and integer index required`);
  if (
    ["bracketGroup", "parenthesisGroup"].includes(v.type) &&
    !Number.isInteger(v.index)
  )
    e.push(`${p}: integer index required`);
  if (v.type === "regexCapture") {
    regex(v, e, p);
    if (!Number.isInteger(v.group)) e.push(`${p}: integer group required`);
  }
  if (v.type === "regexReplace") {
    regex(v, e, p);
    if (typeof v.replacement !== "string") e.push(`${p}: replacement required`);
  }
  if (
    v.type === "stripTokens" &&
    (!Array.isArray(v.values) || v.values.some((x) => typeof x !== "string"))
  )
    e.push(`${p}: string values required`);
  if (v.type === "optionValue" && typeof v.name !== "string")
    e.push(`${p}: name required`);
  if (
    v.type === "tagValue" &&
    (!["exact", "prefix", "contains", "firstExcluding"].includes(
      v.mode as string,
    ) ||
      (v.mode !== "firstExcluding" && typeof v.value !== "string") ||
      (v.exclude !== undefined &&
        (!Array.isArray(v.exclude) ||
          v.exclude.some((x) => typeof x !== "string"))))
  )
    e.push(`${p}: invalid tagValue`);
  if (
    v.type === "booleanTokens" &&
    (!Array.isArray(v.true) ||
      !Array.isArray(v.false) ||
      v.true.some((x) => typeof x !== "string") ||
      v.false.some((x) => typeof x !== "string"))
  )
    e.push(`${p}: true and false token arrays required`);
  if (
    v.type === "map" &&
    (!record(v.values) ||
      Object.values(v.values).some(
        (x) => typeof x !== "string" && typeof x !== "boolean",
      ))
  )
    e.push(`${p}: string/boolean map required`);
}
export function validateStorefrontParserProfileGrammar(
  p: unknown,
): StorefrontParserProfileValidation {
  const errors: string[] = [],
    warnings: string[] = [];
  if (
    !record(p) ||
    p.version !== 1 ||
    (p.kind !== "builtin" && p.kind !== "mapping")
  )
    errors.push("profile: expected a version-1 builtin or mapping profile");
  else if (p.kind === "builtin") {
    only(p, ["kind", "version", "parserType"], errors, "profile");
    if (!builtins.includes(p.parserType as BuiltinParserType))
      errors.push("parserType: unknown builtin parser");
  } else {
    only(p, ["kind", "version", "fields", "exclusions"], errors, "profile");
    if (!record(p.fields)) errors.push("fields: expected object");
    else
      for (const [f, r] of Object.entries(p.fields)) {
        const path = `fields.${f}`;
        if (
          !fields.includes(f as ProfileField) ||
          !record(r) ||
          !Array.isArray(r.candidates) ||
          !r.candidates.length
        ) {
          errors.push(`${path}: invalid field rule`);
          continue;
        }
        only(r, ["candidates"], errors, path);
        r.candidates.forEach((c, n) => {
          const q = `${path}.candidates.${n}`;
          if (!record(c)) {
            errors.push(`${q}: invalid candidate`);
            return;
          }
          only(c, ["source", "value", "transforms", "when"], errors, q);
          const s = "source" in c,
            val = "value" in c;
          if (
            s === val ||
            (s && !sources.includes(c.source as SourcePath)) ||
            (val && typeof c.value !== "string" && typeof c.value !== "boolean")
          )
            errors.push(`${q}: invalid candidate`);
          if (c.when !== undefined && !Array.isArray(c.when))
            errors.push(`${q}.when: expected array`);
          else
            (c.when ?? []).forEach((x, n) =>
              predicate(x, errors, `${q}.when.${n}`),
            );
          if (
            c.transforms !== undefined &&
            (!s || !Array.isArray(c.transforms))
          )
            errors.push(`${q}.transforms: expected array on source candidate`);
          else
            (c.transforms ?? []).forEach((x, n) =>
              transform(x, errors, `${q}.transforms.${n}`),
            );
        });
      }
    if (p.exclusions !== undefined && !Array.isArray(p.exclusions))
      errors.push("exclusions: expected array");
    else
      (p.exclusions ?? []).forEach((x, n) => {
        const q = `exclusions.${n}`;
        if (
          !record(x) ||
          x.reason !== "art-series" ||
          !["product", "allVariants"].includes(x.scope as string)
        ) {
          errors.push(`${q}: invalid exclusion`);
          return;
        }
        only(x, ["reason", "scope", "predicate"], errors, q);
        predicate(x.predicate, errors, `${q}.predicate`);
      });
  }
  return { valid: !errors.length, errors, warnings };
}
export function validateStorefrontMappingProfileContract(
  p: unknown,
): StorefrontParserProfileValidation {
  const r = validateStorefrontParserProfileGrammar(p);
  if (!r.valid) return r;
  if (!record(p) || p.kind !== "mapping" || !record(p.fields))
    return {
      ...r,
      valid: false,
      errors: [...r.errors, "profile: expected mapping profile"],
    };
  const profileFields = p.fields;
  for (const f of ["cardName", "condition", "foil", "isToken"])
    if (!(f in profileFields))
      r.errors.push(`fields.${f}: required for production mappings`);
  if (!("setName" in profileFields) && !("setCode" in profileFields))
    r.errors.push(
      "fields: setName or setCode required for production mappings",
    );
  return { ...r, valid: !r.errors.length };
}
/** Compatibility wrapper; new code should use grammar or contract explicitly. */
export function validateStorefrontParserProfile(
  p: unknown,
  samples: ProfileEvaluationInput[] = [],
): StorefrontParserProfileValidation {
  const r = validateStorefrontParserProfileGrammar(p);
  if (!r.valid || !samples.length || !record(p) || p.kind !== "mapping")
    return r;
  for (const s of samples) {
    const x = evaluateStorefrontParserProfile(
      p as Extract<StorefrontParserProfile, { kind: "mapping" }>,
      s,
    );
    if (!x.cardName) r.errors.push(`sample ${s.variant.id}: missing cardName`);
    if (!x.condition)
      r.errors.push(`sample ${s.variant.id}: missing known condition`);
    if (typeof x.foil !== "boolean")
      r.errors.push(`sample ${s.variant.id}: missing known finish`);
    if (typeof x.isToken !== "boolean")
      r.errors.push(`sample ${s.variant.id}: missing token policy`);
    if (!x.setName && !x.setCode)
      r.errors.push(`sample ${s.variant.id}: missing setName or setCode`);
    const price = Number(s.variant.price.amount);
    if (!Number.isFinite(price) || price < 0)
      r.errors.push(`sample ${s.variant.id}: invalid Storefront price`);
  }
  return { ...r, valid: !r.errors.length };
}
