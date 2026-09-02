/** A deliberately small, serializable grammar for Storefront listing parsers. */
export type BuiltinParserType = 'default' | 'f2f' | '401' | 'hobbies' | 'binderpos' | 'cgrealm';
export type ProfileField = 'cardName' | 'setName' | 'setCode' | 'collectorNumber' | 'condition' | 'foil' | 'isToken';
export type SourcePath =
  | 'product.title' | 'product.vendor' | 'product.productType' | 'product.descriptionHtml'
  | 'product.tags' | 'product.handle' | 'product.onlineStoreUrl' | 'product.availableForSale'
  | 'product.images[0].url' | 'variant.id' | 'variant.title' | 'variant.sku'
  | 'variant.availableForSale' | 'variant.price.amount' | 'variant.price.currencyCode'
  | 'variant.selectedOptions' | 'variant.selectedOptions[0].value'
  | 'variant.selectedOptions[1].value' | 'variant.selectedOptions[2].value';
export type PredicateOperator = 'equals' | 'notEquals' | 'contains' | 'notContains' | 'regex' | 'isEmpty' | 'notEmpty';
export type Predicate = { source: SourcePath; operator: PredicateOperator; value?: string | boolean; pattern?: string; flags?: 'i' };
export type Transform =
  | { type: 'trim' | 'lowercase' | 'uppercase' | 'condition' | 'foil' }
  | { type: 'before' | 'after'; value: string }
  | { type: 'split'; delimiter: string; index: number }
  | { type: 'bracketGroup' | 'parenthesisGroup'; index: number }
  | { type: 'regexCapture'; pattern: string; group: number; flags?: 'i' }
  | { type: 'regexReplace'; pattern: string; replacement: string; flags?: 'i' }
  | { type: 'stripTokens'; values: string[] }
  | { type: 'optionValue'; name: string }
  | { type: 'tagValue'; mode: 'exact' | 'prefix' | 'contains' | 'firstExcluding'; value?: string; exclude?: string[] }
  | { type: 'booleanTokens'; true: string[]; false: string[] }
  | { type: 'map'; values: Record<string, string | boolean> };
export type Candidate = { source: SourcePath; transforms?: Transform[]; when?: Predicate[] } | { value: string | boolean; when?: Predicate[] };
export type FieldRule = { candidates: Candidate[] };
export type ArtSeriesExclusion = { reason: 'art-series'; scope: 'product' | 'allVariants'; predicate: Predicate };
export type StorefrontParserProfile =
  | { kind: 'builtin'; version: 1; parserType: BuiltinParserType }
  | { kind: 'mapping'; version: 1; fields: Partial<Record<ProfileField, FieldRule>>; exclusions?: ArtSeriesExclusion[] };

export type ProfileEvaluationInput = {
  product: { title: string; vendor: string; productType: string; descriptionHtml: string; tags: string[]; handle: string; onlineStoreUrl?: string; availableForSale: boolean; images: Array<{ url: string }> };
  variant: { id: string; title: string; sku?: string; availableForSale: boolean; price: { amount: string; currencyCode: string }; selectedOptions: Array<{ name: string; value: string }> };
};
/** Accepts either Storefront connection edges (production) or nodes (tools). */
export type StorefrontProfileProductLike = {
  title: string; vendor: string; productType: string; descriptionHtml: string; tags: string[]; handle: string;
  onlineStoreUrl?: string | null; availableForSale: boolean;
  images: { edges?: Array<{ node: { url: string } }>; nodes?: Array<{ url: string }> };
  variants: { edges?: Array<{ node: Omit<ProfileEvaluationInput['variant'], 'sku'> & { sku?: string | null } }>; nodes?: Array<Omit<ProfileEvaluationInput['variant'], 'sku'> & { sku?: string | null }> };
};
export function normalizeStorefrontProfileInputs(product: StorefrontProfileProductLike): ProfileEvaluationInput[] {
  const images = product.images.nodes ?? product.images.edges?.map(({ node }) => node) ?? [];
  const variants = product.variants.nodes ?? product.variants.edges?.map(({ node }) => node) ?? [];
  const normalizedProduct: ProfileEvaluationInput['product'] = {
    title: product.title, vendor: product.vendor, productType: product.productType,
    descriptionHtml: product.descriptionHtml, tags: product.tags, handle: product.handle,
    ...(product.onlineStoreUrl ? { onlineStoreUrl: product.onlineStoreUrl } : {}), availableForSale: product.availableForSale,
    images: images.map(image => ({ url: image.url })),
  };
  return variants.map(variant => {
    const { sku, ...withoutSku } = variant;
    return { product: normalizedProduct, variant: { ...withoutSku, ...(sku ? { sku } : {}) } };
  });
}
export type ProfileEvaluationResult = Partial<Record<ProfileField, string | boolean>>;
const fields: ProfileField[] = ['cardName', 'setName', 'setCode', 'collectorNumber', 'condition', 'foil', 'isToken'];
const sources: SourcePath[] = ['product.title','product.vendor','product.productType','product.descriptionHtml','product.tags','product.handle','product.onlineStoreUrl','product.availableForSale','product.images[0].url','variant.id','variant.title','variant.sku','variant.availableForSale','variant.price.amount','variant.price.currencyCode','variant.selectedOptions','variant.selectedOptions[0].value','variant.selectedOptions[1].value','variant.selectedOptions[2].value'];
const builtin: BuiltinParserType[] = ['default','f2f','401','hobbies','binderpos','cgrealm'];
const missing = Symbol('missing');
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const sourceValue = (input: ProfileEvaluationInput, source: SourcePath): unknown => {
  const p = input.product, v = input.variant;
  switch (source) {
    case 'product.title': return p.title; case 'product.vendor': return p.vendor; case 'product.productType': return p.productType;
    case 'product.descriptionHtml': return p.descriptionHtml; case 'product.tags': return p.tags; case 'product.handle': return p.handle;
    case 'product.onlineStoreUrl': return p.onlineStoreUrl; case 'product.availableForSale': return p.availableForSale;
    case 'product.images[0].url': return p.images[0]?.url; case 'variant.id': return v.id; case 'variant.title': return v.title;
    case 'variant.sku': return v.sku; case 'variant.availableForSale': return v.availableForSale;
    case 'variant.price.amount': return v.price.amount; case 'variant.price.currencyCode': return v.price.currencyCode;
    case 'variant.selectedOptions': return v.selectedOptions;
    case 'variant.selectedOptions[0].value': return v.selectedOptions[0]?.value;
    case 'variant.selectedOptions[1].value': return v.selectedOptions[1]?.value;
    case 'variant.selectedOptions[2].value': return v.selectedOptions[2]?.value;
  }
};
const stringValue = (v: unknown): string | typeof missing => typeof v === 'string' ? v : missing;
export function matchesStorefrontProfilePredicate(predicate: Predicate, input: ProfileEvaluationInput): boolean {
  const value = sourceValue(input, predicate.source);
  const text = Array.isArray(value) ? value.join(' ') : String(value ?? '');
  switch (predicate.operator) {
    case 'isEmpty': return !text.trim(); case 'notEmpty': return !!text.trim();
    case 'equals': return value === predicate.value; case 'notEquals': return value !== predicate.value;
    case 'contains': return text.toLowerCase().includes(String(predicate.value ?? '').toLowerCase());
    case 'notContains': return !text.toLowerCase().includes(String(predicate.value ?? '').toLowerCase());
    case 'regex': try { return new RegExp(predicate.pattern!, predicate.flags).test(text.slice(0, 512)); } catch { return false; }
  }
}
function transform(value: unknown, rule: Transform): unknown | typeof missing {
  let text = stringValue(value);
  if (rule.type === 'optionValue') {
    if (!Array.isArray(value)) return missing;
    return (value as Array<{name?: string; value?: string}>).find(o => o.name?.toLowerCase() === rule.name.toLowerCase())?.value ?? missing;
  }
  if (rule.type === 'tagValue') {
    if (!Array.isArray(value)) return missing;
    const tags = value.filter((x): x is string => typeof x === 'string'); const q = rule.value?.toLowerCase();
    if (rule.mode === 'firstExcluding') return tags.find(t => !(rule.exclude ?? []).some(e => t.toLowerCase().includes(e.toLowerCase()))) ?? missing;
    return tags.find(t => rule.mode === 'exact' ? t.toLowerCase() === q : rule.mode === 'prefix' ? t.toLowerCase().startsWith(q!) : t.toLowerCase().includes(q!)) ?? missing;
  }
  if (text === missing) return missing;
  switch (rule.type) {
    case 'trim': return text.trim(); case 'lowercase': return text.toLowerCase(); case 'uppercase': return text.toUpperCase();
    case 'before': { const i = text.indexOf(rule.value); return i < 0 ? missing : text.slice(0, i); }
    case 'after': { const i = text.indexOf(rule.value); return i < 0 ? missing : text.slice(i + rule.value.length); }
    case 'split': return text.split(rule.delimiter)[rule.index] ?? missing;
    case 'bracketGroup': return [...text.matchAll(/\[([^\]]*)\]/g)][rule.index]?.[1] ?? missing;
    case 'parenthesisGroup': return [...text.matchAll(/\(([^)]*)\)/g)][rule.index]?.[1] ?? missing;
    case 'regexCapture': { const m = new RegExp(rule.pattern, rule.flags).exec(text.slice(0, 512)); return m?.[rule.group] ?? missing; }
    case 'regexReplace': return text.slice(0, 512).replace(new RegExp(rule.pattern, rule.flags), rule.replacement);
    case 'stripTokens': return rule.values.reduce((result, token) => result.replace(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ''), text).replace(/\s+/g, ' ').trim();
    case 'condition': {
      const x = text.trim().toLowerCase();
      if (/(?:^|\W)(?:nm|near\s+mint)(?:$|\W)/.test(x)) return 'nm';
      if (/(?:^|\W)(?:lp|pl|sp|light(?:ly)?\s+played|slightly\s+played)(?:$|\W)/.test(x)) return 'lp';
      if (/(?:^|\W)(?:mp|moderately\s+played)(?:$|\W)/.test(x)) return 'mp';
      if (/(?:^|\W)(?:hp|heavily\s+played)(?:$|\W)/.test(x)) return 'hp';
      if (/(?:^|\W)(?:dmg|damaged)(?:$|\W)/.test(x)) return 'dmg';
      return missing;
    }
    case 'foil': {
      const x = text.trim().toLowerCase();
      if (/(?:^|\W)(?:non[-\s]?foil|normal|nf)(?:$|\W)/.test(x)) return false;
      if (/(?:^|\W)(?:foil|fo|etched)(?:$|\W)/.test(x)) return true;
      return missing;
    }
    case 'booleanTokens': { const x = text.trim().toLowerCase(); if (rule.false.some(t => t.toLowerCase() === x)) return false; if (rule.true.some(t => t.toLowerCase() === x)) return true; return missing; }
    case 'map': return rule.values[text.trim().toLowerCase()] ?? missing;
  }
}
export function evaluateStorefrontParserProfile(profile: Extract<StorefrontParserProfile, { kind: 'mapping' }>, input: ProfileEvaluationInput): ProfileEvaluationResult {
  const result: ProfileEvaluationResult = {};
  for (const field of fields) for (const candidate of profile.fields[field]?.candidates ?? []) {
    if (candidate.when?.some(p => !matchesStorefrontProfilePredicate(p, input))) continue;
    let value: unknown = 'source' in candidate ? sourceValue(input, candidate.source) : candidate.value;
    for (const t of ('source' in candidate ? candidate.transforms ?? [] : [])) { value = transform(value, t); if (value === missing) break; }
    if (value === missing || (['foil','isToken'].includes(field) ? typeof value !== 'boolean' : typeof value !== 'string')) continue;
    result[field] = value as string | boolean; break;
  }
  return result;
}
function validateRegex(pattern: unknown, flags: unknown, errors: string[], path: string) {
  if (typeof pattern !== 'string' || pattern.length > 256 || (flags !== undefined && flags !== 'i')) { errors.push(`${path}: invalid regex`); return; }
  try { new RegExp(pattern, flags as string | undefined); } catch { errors.push(`${path}: invalid regex`); }
}
function validatePredicate(v: unknown, errors: string[], path: string): v is Predicate {
  if (!isRecord(v) || !sources.includes(v.source as SourcePath) || !['equals','notEquals','contains','notContains','regex','isEmpty','notEmpty'].includes(v.operator as string)) { errors.push(`${path}: invalid predicate`); return false; }
  if (v.operator === 'regex') validateRegex(v.pattern, v.flags, errors, path); return true;
}
export function validateStorefrontParserProfile(profile: unknown, samples: ProfileEvaluationInput[] = []): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [], warnings: string[] = [];
  if (!isRecord(profile) || profile.version !== 1 || (profile.kind !== 'builtin' && profile.kind !== 'mapping')) errors.push('profile: expected a version-1 builtin or mapping profile');
  else if (profile.kind === 'builtin') { if (!builtin.includes(profile.parserType as BuiltinParserType)) errors.push('parserType: unknown builtin parser'); }
  else {
    if (!isRecord(profile.fields) || !isRecord(profile.fields.cardName)) errors.push('fields.cardName: required');
    for (const [field, rule] of Object.entries(profile.fields ?? {})) {
      if (!fields.includes(field as ProfileField) || !isRecord(rule) || !Array.isArray(rule.candidates) || !rule.candidates.length) { errors.push(`fields.${field}: invalid field rule`); continue; }
      rule.candidates.forEach((c, i) => { const p = `fields.${field}.candidates.${i}`; if (!isRecord(c) || (!('source' in c) && !('value' in c)) || ('source' in c && (!sources.includes(c.source as SourcePath) || 'value' in c)) || ('value' in c && typeof c.value !== 'string' && typeof c.value !== 'boolean')) errors.push(`${p}: invalid candidate`); if (Array.isArray(c.when)) c.when.forEach((x,j) => validatePredicate(x,errors,`${p}.when.${j}`)); else if (c.when !== undefined) errors.push(`${p}.when: expected array`); if (Array.isArray(c.transforms)) c.transforms.forEach((t,j) => { if (!isRecord(t) || typeof t.type !== 'string' || !['trim','lowercase','uppercase','before','after','split','bracketGroup','parenthesisGroup','regexCapture','regexReplace','stripTokens','optionValue','tagValue','condition','foil','booleanTokens','map'].includes(t.type)) errors.push(`${p}.transforms.${j}: unknown transform`); else { if (['before','after'].includes(t.type) && typeof t.value !== 'string') errors.push(`${p}.transforms.${j}: value required`); if (t.type === 'split' && (typeof t.delimiter !== 'string' || !Number.isInteger(t.index))) errors.push(`${p}.transforms.${j}: delimiter and integer index required`); if (['bracketGroup','parenthesisGroup'].includes(t.type) && !Number.isInteger(t.index)) errors.push(`${p}.transforms.${j}: integer index required`); if (t.type === 'regexCapture') { validateRegex(t.pattern,t.flags,errors,`${p}.transforms.${j}`); if (!Number.isInteger(t.group)) errors.push(`${p}.transforms.${j}: integer group required`); } if (t.type === 'regexReplace') validateRegex(t.pattern,t.flags,errors,`${p}.transforms.${j}`); if (t.type === 'stripTokens' && (!Array.isArray(t.values) || t.values.some(x => typeof x !== 'string'))) errors.push(`${p}.transforms.${j}: string values required`); if (t.type === 'optionValue' && typeof t.name !== 'string') errors.push(`${p}.transforms.${j}: name required`); if (t.type === 'tagValue' && (!['exact','prefix','contains','firstExcluding'].includes(t.mode as string) || (t.mode !== 'firstExcluding' && typeof t.value !== 'string') || (t.exclude !== undefined && (!Array.isArray(t.exclude) || t.exclude.some(x => typeof x !== 'string'))))) errors.push(`${p}.transforms.${j}: invalid tagValue`); if (t.type === 'booleanTokens' && (!Array.isArray(t.true) || !Array.isArray(t.false) || t.true.some(x => typeof x !== 'string') || t.false.some(x => typeof x !== 'string'))) errors.push(`${p}.transforms.${j}: true and false token arrays required`); if (t.type === 'map' && (!isRecord(t.values) || Object.values(t.values).some(x => typeof x !== 'string' && typeof x !== 'boolean'))) errors.push(`${p}.transforms.${j}: string/boolean map required`); } }); else if (c.transforms !== undefined) errors.push(`${p}.transforms: expected array`); });
    }
    if (profile.exclusions !== undefined && !Array.isArray(profile.exclusions)) errors.push('exclusions: expected array');
    if (Array.isArray(profile.exclusions)) profile.exclusions.forEach((exclusion, index) => {
      if (!isRecord(exclusion) || exclusion.reason !== 'art-series' || (exclusion.scope !== 'product' && exclusion.scope !== 'allVariants')) errors.push(`exclusions.${index}: invalid exclusion`);
      else validatePredicate(exclusion.predicate, errors, `exclusions.${index}.predicate`);
    });
    if (errors.length) return { valid: false, errors, warnings };
    for (const sample of samples) { const got = evaluateStorefrontParserProfile(profile as Extract<StorefrontParserProfile,{kind:'mapping'}>, sample); if (!got.cardName || typeof got.cardName !== 'string') errors.push(`sample ${sample.variant.id}: missing cardName`); if (!got.condition || got.condition === 'unknown') errors.push(`sample ${sample.variant.id}: missing known condition`); if (!got.setName && !got.setCode) errors.push(`sample ${sample.variant.id}: missing setName or setCode`); const price = Number(sample.variant.price.amount); if (!Number.isFinite(price) || price < 0) errors.push(`sample ${sample.variant.id}: invalid Storefront price`); if (typeof got.setCode === 'string' && !/^[\w.-]+$/.test(got.setCode)) warnings.push(`sample ${sample.variant.id}: unusual setCode`); }
  }
  return { valid: !errors.length, errors, warnings };
}
