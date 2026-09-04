/**
 * Development-only mapping fixtures. They exercise the configuration parser
 * for the existing storefront formats without modifying seed or production
 * store records. Every profile remains subject to fixture review before use.
 */
const optionCondition = [
  { source: 'variant.selectedOptions', transforms: [{ type: 'optionValue', name: 'Condition' }, { type: 'condition' }] },
  { source: 'variant.selectedOptions[0].value', transforms: [{ type: 'condition' }] },
  { source: 'variant.title', transforms: [{ type: 'condition' }] },
];
const optionFoil = [
  { source: 'variant.selectedOptions[1].value', transforms: [{ type: 'foil' }] },
  { source: 'variant.selectedOptions[0].value', transforms: [{ type: 'foil' }] },
  { source: 'variant.title', transforms: [{ type: 'foil' }] },
  { value: false },
];

export const developmentStorefrontProfiles = {
  'face-to-face-games': {
    kind: 'mapping', version: 1, fields: {
      cardName: { candidates: [{ source: 'product.title', transforms: [{ type: 'regexCapture', pattern: '^(.+?)(?:\\s*\\[|$)', group: 1 }, { type: 'trim' }] }] },
      setName: { candidates: [
        { source: 'product.title', transforms: [{ type: 'regexCapture', pattern: '^.+?\\s+\\[[^\\]]+\\]\\s+\\[([^\\]]+)\\]', group: 1 }, { type: 'trim' }] },
        { source: 'product.title', transforms: [{ type: 'bracketGroup', index: 0 }, { type: 'trim' }] },
      ] },
      setCode: { candidates: [
        { source: 'variant.sku', transforms: [{ type: 'regexCapture', pattern: '^SIN-MTG-([A-Z0-9]{2,5})-\\d+', group: 1 }, { type: 'lowercase' }] },
        { source: 'variant.sku', transforms: [{ type: 'regexCapture', pattern: '^M-([A-Z0-9]{2,5})-', group: 1 }, { type: 'lowercase' }] },
        { source: 'product.images[0].url', transforms: [{ type: 'regexCapture', pattern: 'Asset_MTG_([A-Z0-9]{2,5})_\\d+_', group: 1 }, { type: 'lowercase' }] },
      ] },
      collectorNumber: { candidates: [
        { source: 'variant.sku', transforms: [{ type: 'regexCapture', pattern: '^SIN-MTG-[A-Z0-9]{2,5}-(\\d+)', group: 1 }] },
        { source: 'variant.sku', transforms: [{ type: 'regexCapture', pattern: '^M-[A-Z0-9]{2,5}-.+?-(\\d+)-[^-]+-(?:F|FO|NF)$', group: 1 }] },
        { source: 'product.images[0].url', transforms: [{ type: 'regexCapture', pattern: 'Asset_MTG_[A-Z0-9]{2,5}_(\\d+)_', group: 1 }] },
      ] },
      condition: { candidates: optionCondition },
      foil: { candidates: [{ source: 'variant.sku', transforms: [{ type: 'regexCapture', pattern: '-(F|FO|NF)$', group: 1 }, { type: 'map', values: { f: true, fo: true, nf: false } }] }, ...optionFoil] },
      isToken: { candidates: [{ value: true, when: [{ source: 'product.title', operator: 'contains', value: 'token' }] }, { value: false }] },
    },
  },
  '401-games': {
    kind: 'mapping', version: 1, fields: {
      cardName: { candidates: [
        { source: 'product.descriptionHtml', transforms: [{ type: 'regexCapture', pattern: '<span\\s+class="cardname">([^<]+)</span>', group: 1, flags: 'i' }, { type: 'trim' }] },
        { source: 'product.title', transforms: [{ type: 'regexCapture', pattern: '^(.+?)(?:\\s+\\(|$)', group: 1 }, { type: 'trim' }] },
      ] },
      setName: { candidates: [{ source: 'product.vendor', transforms: [{ type: 'trim' }] }] },
      setCode: { candidates: [{ source: 'variant.sku', transforms: [{ type: 'regexCapture', pattern: '^MTG(?:TF|TN|[NFEA])-[A-Z0-9_]+-([A-Z0-9]{2,5})-', group: 1 }, { type: 'lowercase' }] }] },
      collectorNumber: { candidates: [{ source: 'variant.sku', transforms: [{ type: 'regexCapture', pattern: '^MTG(?:TF|TN|[NFEA])-[A-Z0-9_]+-[A-Z0-9]{2,5}-(\\d+[A-Za-z]?)', group: 1 }] }] },
      condition: { candidates: optionCondition },
      foil: { candidates: [{ source: 'variant.sku', transforms: [{ type: 'regexCapture', pattern: '^MTG(TF|TN|[NFEA])-', group: 1 }, { type: 'map', values: { f: true, tf: true, n: false, tn: false, e: false, a: false } }] }, ...optionFoil] },
      isToken: { candidates: [{ source: 'variant.sku', transforms: [{ type: 'regexCapture', pattern: '^MTG(TF|TN|[NFEA])-', group: 1 }, { type: 'map', values: { tf: true, tn: true, f: false, n: false, e: false, a: false } }] }, { value: false }] },
    }, exclusions: [{ reason: 'art-series', scope: 'allVariants', predicate: { source: 'variant.sku', operator: 'regex', pattern: '^MTGA-', flags: 'i' } }],
  },
  hobbiesville: {
    kind: 'mapping', version: 1, fields: {
      cardName: { candidates: [{ source: 'product.title', transforms: [{ type: 'regexReplace', pattern: '\\s*\\([A-Z0-9_]{2,8}-[A-Za-z0-9]+\\)(?:\\s+(?:snow\\s+)?(?:non-?)?foil)?\\s*:?', replacement: '', flags: 'i' }, { type: 'trim' }] }] },
      setCode: { candidates: [{ source: 'variant.sku', transforms: [{ type: 'regexCapture', pattern: '^MTG-([A-Z0-9_]{2,8})-', group: 1 }, { type: 'lowercase' }] }] },
      collectorNumber: { candidates: [{ source: 'variant.sku', transforms: [{ type: 'regexCapture', pattern: '^MTG-[A-Z0-9_]{2,8}-(\\d+[A-Za-z]?)-', group: 1 }] }] },
      condition: { candidates: optionCondition },
      foil: { candidates: [{ source: 'variant.sku', transforms: [{ type: 'regexCapture', pattern: '^MTG-[A-Z0-9_]{2,8}-\\d+[A-Za-z]?-(F-)?', group: 1 }, { type: 'map', values: { 'f-': true, '': false } }] }, ...optionFoil] },
      isToken: { candidates: [{ value: true, when: [{ source: 'product.title', operator: 'contains', value: 'token' }] }, { value: false }] },
    },
  },
  'the-cg-realm': {
    kind: 'mapping', version: 1, fields: {
      cardName: { candidates: [{ source: 'product.title', transforms: [{ type: 'regexCapture', pattern: '^(.+?)(?=\\s[\\[(]|$)', group: 1 }, { type: 'trim' }] }] },
      setName: { candidates: [{ source: 'product.vendor', transforms: [{ type: 'trim' }] }] },
      setCode: { candidates: [{ source: 'variant.sku', transforms: [{ type: 'regexCapture', pattern: '^MTG-(?:LIST-)?([A-Z0-9_]{2,8})(?:-|$)', group: 1 }, { type: 'lowercase' }] }] },
      collectorNumber: { candidates: [{ source: 'variant.sku', transforms: [{ type: 'regexCapture', pattern: '^MTG-(?:LIST-)?[A-Z0-9_]{2,8}-(\\d+[A-Za-z]?)(?:-|$)', group: 1 }] }] },
      condition: { candidates: optionCondition },
      foil: { candidates: [{ source: 'variant.sku', transforms: [{ type: 'regexCapture', pattern: '^MTG-(?:LIST-)?[A-Z0-9_]{2,8}(?:-\\d+[A-Za-z]?)?-(F)-', group: 1 }, { type: 'map', values: { f: true } }] }, ...optionFoil] },
      isToken: { candidates: [{ value: true, when: [{ source: 'product.title', operator: 'contains', value: 'token' }] }, { value: false }] },
    },
  },
} as const;
