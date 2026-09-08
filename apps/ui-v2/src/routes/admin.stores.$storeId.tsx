import { useEffect, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import ArrowBack from '@mui/icons-material/ArrowBack';
import Edit from '@mui/icons-material/Edit';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import FormControlLabel from '@mui/material/FormControlLabel';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { fetchAdminStore, updateAdminStore, type AdminStore } from '@/api/admin-stores';

export const Route = createFileRoute('/admin/stores/$storeId')({ component: StoreDetailsRoute });

const scraperTypes = ['default', '401', 'f2f', 'hobbies', 'binderpos', 'cgrealm'];
// CrystalCommerce remains a typed, documented future configuration, but is
// intentionally not selectable until vendor-authenticated probing is ready.
const platformTypes = ['', 'shopify_storefront', 'conduct_commerce'];
const storefrontApiVersions = ['2025-01', '2025-04', '2025-07', '2025-10', '2026-01', '2026-04'];

function StoreDetailsRoute() {
  const navigate = useNavigate();
  const { storeId } = Route.useParams();
  const id = Number(storeId);
  const [store, setStore] = useState<AdminStore | null>(null);
  const [draft, setDraft] = useState<EditableStore | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isInteger(id) || id < 1) { setError('Invalid store.'); setLoading(false); return; }
    fetchAdminStore(id).then((result) => { setStore(result); setDraft(editable(result)); }).catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to load store.')).finally(() => setLoading(false));
  }, [id]);

  const save = async () => {
    if (!draft || !store) return;
    setSaving(true);
    setError(null);
    try {
      const scraperConfig = buildScraperConfig(store, draft);
      const discoveryConfig = { ...(store.discoveryConfig ?? {}), discoveryEnabled: draft.discoveryEnabled };
      const result = await updateAdminStore(store.id, {
        name: draft.name.trim(), displayName: draft.displayName.trim(), baseUrl: draft.baseUrl.trim(),
        isActive: draft.isActive, scraperType: draft.scraperType,
        platformType: draft.platformType || undefined, rateLimitPerSecond: Number(draft.rateLimitPerSecond),
        ...(scraperConfig ? { scraperConfig } : {}), discoveryConfig,
      });
      setStore(result);
      setDraft(editable(result));
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save store.');
    } finally { setSaving(false); }
  };

  return <Container maxWidth={false} sx={{ maxWidth: 980 }}><Stack spacing={3}>
    <Box>
      <Button startIcon={<ArrowBack />} size="small" onClick={() => navigate({ to: '/admin/stores/' })} sx={{ mb: 1 }}>Stores</Button>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 2, flexWrap: 'wrap' }}>
        <Box><Typography variant="h2">{store?.displayName ?? 'Store details'}</Typography><Typography sx={{ color: 'text.secondary', mt: 0.75 }}>{store?.baseUrl}</Typography></Box>
        {store && !editing && <Button variant="contained" startIcon={<Edit />} onClick={() => setEditing(true)}>Edit store</Button>}
      </Box>
    </Box>
    {loading && <LinearProgress sx={{ height: 4, borderRadius: 999 }} />}
    {error && <Alert severity="error" sx={{ borderRadius: 1.5 }}>{error}</Alert>}
    {store && draft && <Paper sx={{ borderRadius: 3, boxShadow: 2, p: { xs: 3, md: 4 } }}>
      {editing ? <EditForm draft={draft} store={store} setDraft={setDraft} saving={saving} onCancel={() => { setDraft(editable(store)); setEditing(false); }} onSave={() => void save()} /> : <ReadOnlyStore store={store} />}
    </Paper>}
  </Stack></Container>;
}

type SourceMode = 'products-query' | 'collection';
type EditableStore = {
  name: string; displayName: string; baseUrl: string; isActive: boolean; scraperType: string;
  platformType: string; rateLimitPerSecond: string; discoveryEnabled: boolean; shopifyUrl: string;
  storefrontApiVersion: string; sourceMode: SourceMode; productQuery: string; collectionHandle: string;
  endpoint: string; storeId: string; credentialRef: string; catalogMode: 'category' | 'search' | 'all-products' | 'collection' | 'magic-product-type'; categoryId: string; query: string; currency: string;
};

function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

/** Preserve an onboarding-created parser profile while giving new saves the
 * discriminated settings envelope used by every parser backend. */
function parserConfigFor(config: Record<string, unknown>): Record<string, unknown> | undefined {
  const existing = record(config.parserConfig);
  if (typeof existing.parserType === 'string' && Object.prototype.hasOwnProperty.call(existing, 'settings')) return existing;
  const profile = record(config.parser);
  if (profile.kind === 'builtin' && typeof profile.parserType === 'string')
    return { parserType: profile.parserType, settings: { profile } };
  if (profile.kind === 'mapping') return { parserType: 'mapping', settings: { profile } };
  return undefined;
}

function editable(store: AdminStore): EditableStore {
  const config = record(store.scraperConfig);
  const source = record(config.source);
  return {
    name: store.name, displayName: store.displayName, baseUrl: store.baseUrl, isActive: store.isActive,
    scraperType: store.scraperType, platformType: store.platformType ?? '', rateLimitPerSecond: String(store.rateLimitPerSecond),
    discoveryEnabled: record(store.discoveryConfig).discoveryEnabled === true,
    shopifyUrl: typeof config.shopifyUrl === 'string' ? config.shopifyUrl : new URL(store.baseUrl).host,
    storefrontApiVersion: typeof config.storefrontApiVersion === 'string' ? config.storefrontApiVersion : '2026-04',
    sourceMode: source.mode === 'collection' ? 'collection' : 'products-query',
    productQuery: typeof source.productQuery === 'string' ? source.productQuery : typeof config.storefrontScope === 'string' ? config.storefrontScope : '',
    collectionHandle: typeof source.collectionHandle === 'string' ? source.collectionHandle : '',
    endpoint: typeof config.endpoint === 'string' ? config.endpoint : typeof config.storefrontHost === 'string' ? config.storefrontHost : '', storeId: typeof config.storeId === 'string' ? config.storeId : '', credentialRef: typeof config.credentialRef === 'string' ? config.credentialRef : '',
    catalogMode: source.mode === 'category' || source.mode === 'search' || source.mode === 'all-products' || source.mode === 'collection' || source.mode === 'magic-product-type' ? source.mode : (store.platformType === 'conduct_commerce' ? 'magic-product-type' : 'all-products'),
    categoryId: typeof source.categoryId === 'string' ? source.categoryId : typeof source.categoryName === 'string' ? source.categoryName : typeof source.productTypeId === 'number' ? String(source.productTypeId) : '', query: typeof source.query === 'string' ? source.query : '', currency: typeof config.currency === 'string' ? config.currency : 'CAD',
  };
}

function buildScraperConfig(store: AdminStore, draft: EditableStore): Record<string, unknown> | undefined {
  if (draft.platformType === 'crystal_commerce') {
    const config = { ...record(store.scraperConfig) };
    const source = draft.catalogMode === 'category' ? { kind: 'catalog-api', mode: 'category', categoryId: draft.categoryId.trim() } : draft.catalogMode === 'search' ? { kind: 'catalog-api', mode: 'search', query: draft.query.trim() } : { kind: 'catalog-api', mode: 'all-products' };
    return { ...config, platform: 'crystal_commerce', endpoint: draft.endpoint.trim(), storeId: draft.storeId.trim(), credentialRef: draft.credentialRef.trim(), source, ...(parserConfigFor(config) ? { parserConfig: parserConfigFor(config) } : {}) };
  }
  if (draft.platformType === 'conduct_commerce') {
    const config = { ...record(store.scraperConfig) };
    const source = draft.catalogMode === 'category' ? { kind: 'conduct-storefront-api', mode: 'category', categoryName: draft.categoryId.trim() } : draft.catalogMode === 'search' ? { kind: 'conduct-storefront-api', mode: 'search', query: draft.query.trim() } : { kind: 'conduct-storefront-api', mode: 'magic-product-type', productTypeId: Number(draft.categoryId || 1) };
    return { ...config, platform: 'conduct_commerce', storefrontHost: draft.endpoint.trim(), currency: draft.currency.trim().toUpperCase(), source, parser: { kind: 'builtin', version: 1, parserType: 'conduct' }, parserConfig: { parserType: 'conduct', settings: {} } };
  }
  if (draft.platformType !== 'shopify_storefront') return undefined;
  const config = { ...record(store.scraperConfig) };
  const source = draft.sourceMode === 'collection'
    ? { kind: 'storefront-graphql', mode: 'collection', collectionHandle: draft.collectionHandle.trim() }
    : { kind: 'storefront-graphql', mode: 'products-query', productQuery: draft.productQuery.trim() };
  delete config.storefrontScope;
  return { ...config, shopifyUrl: draft.shopifyUrl.trim(), storefrontApiVersion: draft.storefrontApiVersion, source, ...(parserConfigFor(config) ? { parserConfig: parserConfigFor(config) } : {}) };
}

function ReadOnlyStore({ store }: { store: AdminStore }) {
  const draft = editable(store);
  const isShopify = store.platformType === 'shopify_storefront'; const isCrystal = store.platformType === 'crystal_commerce'; const isConduct = store.platformType === 'conduct_commerce';
  return <Stack spacing={2.25}>
    <Stack direction="row" spacing={1}><Chip label={store.isActive ? 'Active' : 'Inactive'} color={store.isActive ? 'success' : 'default'} /><Chip label={store.platformType ?? 'Legacy'} variant="outlined" /></Stack>
    <Details label="Slug" value={store.name} /><Details label="Scraper" value={`${store.scraperType} · ${store.rateLimitPerSecond}/sec`} />
    <Details label="Discovery" value={draft.discoveryEnabled ? 'Enabled' : 'Disabled'} />
    {isShopify && <><Typography variant="subtitle2" sx={{ pt: 1 }}>Shopify connection</Typography><Details label="Shopify host" value={draft.shopifyUrl} /><Details label="API version" value={draft.storefrontApiVersion} /><Details label="Catalog source" value={draft.sourceMode === 'collection' ? 'Collection' : 'Product query'} /><Details label={draft.sourceMode === 'collection' ? 'Collection handle' : 'Product query'} value={draft.sourceMode === 'collection' ? draft.collectionHandle : draft.productQuery} /></>}
    {!isShopify && <Typography variant="body2" color="text.secondary">This integration has no storefront settings to manage here.</Typography>}
    {isCrystal && <><Typography variant="subtitle2" sx={{ pt: 1 }}>CrystalCommerce connection</Typography><Details label="API endpoint" value={draft.endpoint} /><Details label="Store ID" value={draft.storeId} /><Details label="Catalog source" value={draft.catalogMode} /></>}
    {isConduct && <><Typography variant="subtitle2" sx={{ pt: 1 }}>Conduct Commerce connection</Typography><Details label="Storefront host" value={draft.endpoint} /><Details label="Currency" value={draft.currency} /><Details label="Catalog source" value={draft.catalogMode} /></>}
  </Stack>;
}

function Details({ label, value }: { label: string; value: string }) { return <Box><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="body2" sx={{ wordBreak: 'break-word' }}>{value || 'Not set'}</Typography></Box>; }

function EditForm({ draft, store, setDraft, saving, onCancel, onSave }: { draft: EditableStore; store: AdminStore; setDraft: (next: EditableStore) => void; saving: boolean; onCancel: () => void; onSave: () => void }) {
  const field = (key: keyof EditableStore) => (event: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [key]: event.target.value });
  const compatibleScraperTypes = draft.platformType === 'conduct_commerce' || draft.platformType === 'crystal_commerce'
    ? (draft.platformType === 'conduct_commerce' ? ['conduct'] : ['default'])
    : scraperTypes;
  const scraperOptions = Array.from(new Set([...compatibleScraperTypes, draft.scraperType]));
  const platformOptions = Array.from(new Set([...platformTypes, store.platformType ?? '']));
  const apiOptions = Array.from(new Set([...storefrontApiVersions, draft.storefrontApiVersion]));
  const isShopify = draft.platformType === 'shopify_storefront'; const isCrystal = draft.platformType === 'crystal_commerce'; const isConduct = draft.platformType === 'conduct_commerce';
  return <Stack spacing={3}>
    <Box><Typography variant="subtitle2" sx={{ mb: 1.5 }}>Store details</Typography><Stack spacing={2}><TextField label="Display name" value={draft.displayName} onChange={field('displayName')} required /><TextField label="Slug" value={draft.name} onChange={field('name')} helperText="Lowercase letters, numbers, and hyphens." required /><TextField label="Store URL" type="url" value={draft.baseUrl} onChange={field('baseUrl')} required /><FormControlLabel control={<Switch checked={draft.isActive} onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })} />} label="Store is active" /></Stack></Box>
  <Box><Typography variant="subtitle2" sx={{ mb: 1.5 }}>Integration</Typography><Box sx={{ display: 'grid', gridTemplateColumns: { sm: '1fr 1fr 1fr' }, gap: 1.5 }}><TextField select label="Scraper type" value={draft.scraperType} onChange={field('scraperType')}>{scraperOptions.map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField><TextField select label="Platform" value={draft.platformType} onChange={(event) => { const platformType = event.target.value; setDraft({ ...draft, platformType, scraperType: platformType === 'conduct_commerce' ? 'conduct' : platformType === 'crystal_commerce' ? 'default' : draft.scraperType }); }}><MenuItem value="">Legacy / none</MenuItem>{platformOptions.filter(Boolean).map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField><TextField label="Rate limit / sec" type="number" value={draft.rateLimitPerSecond} onChange={field('rateLimitPerSecond')} inputProps={{ min: 1, step: 1 }} /></Box><FormControlLabel sx={{ mt: 1 }} control={<Switch checked={draft.discoveryEnabled} onChange={(event) => setDraft({ ...draft, discoveryEnabled: event.target.checked })} />} label="Include in automatic discovery" /></Box>
    {isShopify && <Box><Typography variant="subtitle2" sx={{ mb: 1.5 }}>Shopify storefront</Typography><Stack spacing={2}><TextField label="Shopify host" value={draft.shopifyUrl} onChange={field('shopifyUrl')} helperText="For example, shop.example.com or shop.myshopify.com." required /><Box sx={{ display: 'grid', gridTemplateColumns: { sm: '1fr 1fr' }, gap: 1.5 }}><TextField select label="Storefront API version" value={draft.storefrontApiVersion} onChange={field('storefrontApiVersion')}>{apiOptions.map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField><TextField select label="Catalog source" value={draft.sourceMode} onChange={field('sourceMode')}><MenuItem value="products-query">Product query</MenuItem><MenuItem value="collection">Collection</MenuItem></TextField></Box>{draft.sourceMode === 'collection' ? <TextField label="Collection handle" value={draft.collectionHandle} onChange={field('collectionHandle')} helperText="The collection handle from the store URL." required /> : <TextField label="Product query" value={draft.productQuery} onChange={field('productQuery')} helperText="Shopify catalog query used to select the supported products." multiline minRows={2} required />}</Stack></Box>}
    {isCrystal && <Box><Typography variant="subtitle2" sx={{ mb: 1.5 }}>CrystalCommerce catalog API</Typography><Stack spacing={2}><TextField label="API endpoint" type="url" value={draft.endpoint} onChange={field('endpoint')} helperText="Usually https://api.crystalcommerce.com" required /><TextField label="Store ID" value={draft.storeId} onChange={field('storeId')} required /><TextField label="Credential secret reference" value={draft.credentialRef} onChange={field('credentialRef')} helperText="Environment/secret name holding login:key; the credential itself is never stored here." required /><Box sx={{ display: 'grid', gridTemplateColumns: { sm: '1fr 1fr' }, gap: 1.5 }}><TextField select label="Catalog source" value={draft.catalogMode} onChange={field('catalogMode')}><MenuItem value="all-products">All products</MenuItem><MenuItem value="category">Category</MenuItem><MenuItem value="search">Search</MenuItem></TextField>{draft.catalogMode === 'category' ? <TextField label="Category ID" value={draft.categoryId} onChange={field('categoryId')} required /> : draft.catalogMode === 'search' ? <TextField label="Search query" value={draft.query} onChange={field('query')} required /> : <Box />}</Box></Stack></Box>}
    {isConduct && <Box><Typography variant="subtitle2" sx={{ mb: 1.5 }}>Conduct Commerce storefront API</Typography><Stack spacing={2}><TextField label="Storefront host" value={draft.endpoint} onChange={field('endpoint')} helperText="For example, prismatcg.com; do not include https:// or a path." required /><TextField label="Currency" value={draft.currency} onChange={field('currency')} helperText="Three-letter ISO currency code; Conduct listing responses do not expose it." required inputProps={{ maxLength: 3 }} /><Box sx={{ display: 'grid', gridTemplateColumns: { sm: '1fr 1fr' }, gap: 1.5 }}><TextField select label="Catalog source" value={draft.catalogMode} onChange={field('catalogMode')}><MenuItem value="magic-product-type">All Magic Singles categories</MenuItem><MenuItem value="category">One category</MenuItem><MenuItem value="search">Search</MenuItem></TextField>{draft.catalogMode === 'magic-product-type' ? <TextField label="Magic product type ID" value={draft.categoryId || '1'} onChange={field('categoryId')} helperText="Observed as 1 across verified stores; onboarding validates it." required /> : draft.catalogMode === 'category' ? <TextField label="Category display name" value={draft.categoryId} onChange={field('categoryId')} required /> : <TextField label="Search query" value={draft.query} onChange={field('query')} required />}</Box></Stack></Box>}
    <Alert severity="info" sx={{ borderRadius: 1.5 }}>Parser rules are preserved when you save. Use storefront onboarding to create or change parser rules.</Alert>
    <Stack direction="row" spacing={1}><Button variant="contained" disabled={saving} onClick={onSave}>Save changes</Button><Button disabled={saving} onClick={onCancel}>Cancel</Button></Stack>
  </Stack>;
}
