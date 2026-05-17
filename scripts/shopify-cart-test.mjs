#!/usr/bin/env node
// Prototype: create a Shopify Storefront API cart and print its checkout URL.
//
// Usage:
//   node scripts/shopify-cart-test.mjs \
//     --shop=examplestore.myshopify.com \
//     --token=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
//     --variant=44781230456832:2 \
//     --variant=44781230456900
//
// Args (CLI flag — or env var):
//   --shop          — SHOPIFY_SHOP         myshopify domain (e.g. foo.myshopify.com)
//   --token         — SHOPIFY_TOKEN        Storefront API access token (public)
//   --api-version   — SHOPIFY_API_VERSION  defaults to 2025-01
//   --variant       — repeatable; format <numericId>[:quantity] or full gid://...
//   --country       — ISO country code for buyerIdentity (defaults to CA)
//   --add-line      — repeatable; if provided, runs cartLinesAdd after cartCreate
//                     so the script exercises both mutations
//
// Notes:
//   - The Storefront access token is "public" (read/write cart, no admin scopes)
//     so it's safe to use from a server or a browser. It is NOT the Admin token.
//   - Each Shopify store needs its own token; a cart cannot span stores.
//   - The cart.checkoutUrl is the entry point to Shopify's hosted checkout.

const argv = process.argv.slice(2);
const args = parseArgs(argv);

const shop = first(args.shop) || process.env.SHOPIFY_SHOP;
const token = first(args.token) || process.env.SHOPIFY_TOKEN;
const apiVersion =
  first(args['api-version']) || process.env.SHOPIFY_API_VERSION || '2025-01';
const countryCode = (first(args.country) || 'CA').toUpperCase();
const variantArgs = args.variant ?? [];
const addLineArgs = args['add-line'] ?? [];

if (!shop || !token || variantArgs.length === 0) {
  console.error(
    'Usage: node scripts/shopify-cart-test.mjs --shop=foo.myshopify.com --token=xxx --variant=<id>[:qty] [--variant=...] [--add-line=<id>[:qty]] [--country=CA] [--api-version=2025-01]',
  );
  process.exit(1);
}

const endpoint = `https://${shop}/api/${apiVersion}/graphql.json`;

async function graphql(query, variables) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Shopify-Storefront-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
  }
  const body = await res.json();
  if (body.errors?.length) {
    const msg = body.errors.map((e) => e.message).join('; ');
    throw new Error(`GraphQL error: ${msg}`);
  }
  return body.data;
}

const CART_FIELDS = `
  id
  checkoutUrl
  totalQuantity
  cost {
    subtotalAmount { amount currencyCode }
    totalAmount    { amount currencyCode }
  }
  lines(first: 50) {
    edges {
      node {
        id
        quantity
        merchandise {
          ... on ProductVariant {
            id
            title
            availableForSale
            price { amount currencyCode }
            product { title handle }
          }
        }
      }
    }
  }
`;

const CART_CREATE = `
  mutation cartCreate($input: CartInput!) {
    cartCreate(input: $input) {
      cart { ${CART_FIELDS} }
      userErrors { field message code }
    }
  }
`;

const CART_LINES_ADD = `
  mutation cartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
    cartLinesAdd(cartId: $cartId, lines: $lines) {
      cart { ${CART_FIELDS} }
      userErrors { field message code }
    }
  }
`;

const initialLines = variantArgs.map(parseLine);
const extraLines = addLineArgs.map(parseLine);

console.log(`POST ${endpoint}`);
console.log(`Creating cart with ${initialLines.length} line(s)...`);

const createData = await graphql(CART_CREATE, {
  input: {
    lines: initialLines,
    buyerIdentity: { countryCode },
    attributes: [{ key: 'source', value: 'scoutlgs-prototype' }],
  },
});

reportUserErrors(createData.cartCreate.userErrors);
let cart = createData.cartCreate.cart;
if (!cart) {
  console.error('Cart was not created.');
  process.exit(2);
}
printCart(cart, 'Cart created');

if (extraLines.length > 0) {
  console.log(`\nAdding ${extraLines.length} additional line(s) via cartLinesAdd...`);
  const addData = await graphql(CART_LINES_ADD, {
    cartId: cart.id,
    lines: extraLines,
  });
  reportUserErrors(addData.cartLinesAdd.userErrors);
  cart = addData.cartLinesAdd.cart ?? cart;
  printCart(cart, 'Cart after add');
}

console.log('\n=== Checkout URL ===');
console.log(cart.checkoutUrl);
console.log(
  '\nOpen that URL in a browser to land on Shopify-hosted checkout for this cart.',
);

// -----------------------------------------------------------------------------
// helpers
// -----------------------------------------------------------------------------

function parseArgs(args) {
  const out = {};
  for (const raw of args) {
    if (!raw.startsWith('--')) continue;
    const eq = raw.indexOf('=');
    const key = eq === -1 ? raw.slice(2) : raw.slice(2, eq);
    const val = eq === -1 ? 'true' : raw.slice(eq + 1);
    if (out[key]) out[key].push(val);
    else out[key] = [val];
  }
  return out;
}

function first(v) {
  return Array.isArray(v) ? v[0] : v;
}

function parseLine(spec) {
  const [rawId, rawQty] = spec.split(':');
  const merchandiseId = rawId.startsWith('gid://')
    ? rawId
    : `gid://shopify/ProductVariant/${rawId}`;
  const quantity = rawQty ? parseInt(rawQty, 10) : 1;
  if (!Number.isFinite(quantity) || quantity < 1) {
    throw new Error(`Invalid quantity in --variant=${spec}`);
  }
  return { merchandiseId, quantity };
}

function reportUserErrors(errors) {
  if (!errors?.length) return;
  console.error('userErrors:');
  for (const e of errors) {
    const field = e.field?.join('.') ?? '';
    console.error(`  - [${e.code ?? ''}] ${field}: ${e.message}`);
  }
}

function printCart(cart, header) {
  console.log(`\n=== ${header} ===`);
  console.log(`Cart ID:      ${cart.id}`);
  console.log(`Total items:  ${cart.totalQuantity}`);
  console.log(
    `Subtotal:     ${cart.cost.subtotalAmount.amount} ${cart.cost.subtotalAmount.currencyCode}`,
  );
  console.log(
    `Total:        ${cart.cost.totalAmount.amount} ${cart.cost.totalAmount.currencyCode}`,
  );
  console.log('Lines:');
  for (const { node } of cart.lines.edges) {
    const m = node.merchandise;
    const oos = m.availableForSale ? '' : ' [OUT OF STOCK]';
    const price = m.price ? ` @ ${m.price.amount} ${m.price.currencyCode}` : '';
    console.log(
      `  - ${node.quantity}x ${m.product?.title ?? '?'} — ${m.title}${price}${oos}`,
    );
    console.log(`    variant: ${m.id}`);
  }
}
