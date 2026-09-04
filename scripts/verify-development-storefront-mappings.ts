#!/usr/bin/env node
/** Read-only, in-memory coverage check for development mapping fixtures. */
import { readFile } from 'node:fs/promises';
import { evaluateStorefrontParserProfile, normalizeStorefrontProfileInputs } from '../packages/shared/dist/storefront-parser-profile.js';
import { developmentStorefrontProfiles } from './dev-storefront-mapping-profiles.ts';
import { BinderposCardDetailExtractor } from '../packages/core/src/platform/adapters/shopify/extractors/binderpos/binderpos-card-detail.extractor.ts';
import { parseConditionAndFoil } from '../packages/core/src/platform/adapters/shopify/shopify-variant.utils.ts';

const MINIMUM = 100;
const QUERY = `query ConfigCoverage($first: Int!, $query: String) { products(first: $first, query: $query, sortKey: ID) { nodes { handle title vendor productType descriptionHtml availableForSale tags onlineStoreUrl images(first: 1) { nodes { url } } variants(first: 100) { nodes { id title sku availableForSale price { amount currencyCode } selectedOptions { name value } } } } } }`;
const stores = [
  ['face-to-face-games', 'https://facetofacegames.com', 'product_type:Singles vendor:Magic'],
  ['401-games', 'https://store.401games.ca', 'product_type:"Magic: The Gathering Singles"'],
  ['hobbiesville', 'https://hobbiesville.com', 'product_type:Single tag:Brands_Magicthegathering'],
  ['house-of-cards', 'https://house-of-cards-mtg.myshopify.com', 'product_type:"MTG Single"'],
  ['black-knight-games', 'https://black-knight-games.myshopify.com', 'product_type:"MTG Single"'],
  ['exor-games', 'https://most-wanted-ca.myshopify.com', 'product_type:"MTG Single"'],
  ['game-knight', 'https://gameknight-games.myshopify.com', 'product_type:"MTG Single"'],
  ['the-cg-realm', 'https://the-cg-realm.myshopify.com', 'product_type:"MTG Single"'],
] as const;

function isMappedVariant(value: Record<string, unknown>) {
  return typeof value.cardName === 'string' && value.cardName.trim().length > 0
    && (typeof value.setName === 'string' && value.setName.trim().length > 0 || typeof value.setCode === 'string' && value.setCode.trim().length > 0)
    && typeof value.condition === 'string' && value.condition !== 'unknown';
}

function isBinderVariant(product: any, variant: any) {
  const extractor = new BinderposCardDetailExtractor();
  const title = extractor.parseTitle(product.title);
  const sku = extractor.parseSkuInfo(variant.sku ?? undefined);
  const condition = parseConditionAndFoil({ option1: variant.selectedOptions[0]?.value, option2: variant.selectedOptions[1]?.value, title: variant.title });
  return Boolean(title.cardName && (title.setName || sku.setCode) && condition.condition !== 'unknown');
}

async function fetchProducts(url: string, scope: string) {
  const endpoint = new URL('/api/2026-04/graphql.json', url);
  const response = await fetch(endpoint, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ query: QUERY, variables: { first: 100, query: scope } }) });
  const body = await response.json();
  if (!response.ok || body.errors?.length) throw new Error(`HTTP ${response.status}: ${body.errors?.map((e: any) => e.message).join('; ') ?? 'no products'}`);
  return body.data?.products?.nodes ?? [];
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name: string) => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
  if (args.includes('--help')) {
    console.error('Usage: pnpm store:verify-dev-mappings [--profile mapping.json --url https://store --scope \'product_type:"Singles"\']');
    return;
  }
  const profilePath = option('--profile'), url = option('--url'), scope = option('--scope');
  if ([profilePath, url, scope].some(Boolean) && !(profilePath && url && scope)) throw new Error('--profile, --url, and --scope must be supplied together');
  if (args.some((arg, index) => arg.startsWith('--') && !['--help', '--profile', '--url', '--scope'].includes(arg) && (index === 0 || args[index - 1] !== '--profile'))) throw new Error('unknown argument');
  const selectedStores = profilePath
    ? [['generated-profile', url!, scope!] as const]
    : stores;
  const generatedProfile = profilePath ? JSON.parse(await readFile(profilePath, 'utf8')) : null;
  const reports = [];
  for (const [name, url, scope] of selectedStores) {
    const products = await fetchProducts(url, scope);
    const mapping = generatedProfile ?? developmentStorefrontProfiles[name as keyof typeof developmentStorefrontProfiles];
    const variants = mapping
      ? products.flatMap((product: any) => normalizeStorefrontProfileInputs(product).map(input => evaluateStorefrontParserProfile(mapping as any, input)))
      : products.flatMap((product: any) => product.variants.nodes.map((variant: any) => ({ valid: isBinderVariant(product, variant) })));
    const valid = mapping ? variants.filter(isMappedVariant).length : variants.filter((variant: any) => variant.valid).length;
    reports.push({ store: name, url, scope, mode: mapping ? 'mapping-config' : 'binderpos-builtin', sampledVariants: variants.length, validVariants: valid, minimum: MINIMUM, pass: valid >= MINIMUM });
  }
  console.log(JSON.stringify({ readOnly: true, reports }, null, 2));
  if (reports.some(report => !report.pass)) process.exitCode = 2;
}

main().catch(error => { console.error(`Development storefront mapping verification failed: ${error.message}`); process.exitCode = 1; });
