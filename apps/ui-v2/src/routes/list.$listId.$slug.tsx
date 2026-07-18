import { useCallback, useMemo } from 'react';
import { createFileRoute, useNavigate, useParams } from '@tanstack/react-router';
import { slugifyName } from '@/utils/slugify';
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Paper from '@mui/material/Paper';
import { ChevronLeft, Construction } from '@mui/icons-material';
import { useLists } from '@/components/lists/ListsContext';
import { cartItemId, useCart } from '@/components/cart/CartContext';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useConfirm } from '@/components/feedback/ConfirmDialog';
import { ColorPips } from '@/components/lists/ColorPips';
import { KpiTile } from '@/components/results/KpiTile';
import { DecklistRow } from '@/components/results/DecklistRow';
import { DECK_META } from '@/data/sample';
import { colorIdentityName } from '@/data/colors';
import { groupByName } from '@/utils/parseDeckList';
import { cartOffersByName, normalizeCardName, selectedOfferStatus } from '@/utils/listCartStatus';

export const Route = createFileRoute('/list/$listId/$slug')({
  component: ListDetailRoute,
});

const CONDITION_LABELS: Record<string, string> = {
  nm: 'NM', lp: 'LP', mp: 'MP', hp: 'HP', dmg: 'DMG', unknown: 'Unknown',
};

function ListDetailRoute() {
  const { listId } = useParams({ from: '/list/$listId/$slug' });
  const navigate = useNavigate();
  const { get, getList, remove: removeList, removeCardFromList, loading } = useLists();
  const { items: cartItems, remove: removeFromCart } = useCart();
  const confirm = useConfirm();
  const cards = get(listId);
  const list = getList(listId);
  const listName = list?.name ?? '';
  const entries = useMemo(() => groupByName(cards), [cards]);

  const offersByCardName = useMemo(() => cartOffersByName(cartItems), [cartItems]);

  const cartSummary = useMemo(() => {
    const selectedItems = entries.flatMap((entry) =>
      offersByCardName.get(normalizeCardName(entry.name)) ?? [],
    );
    return {
      total: selectedItems.reduce((sum, item) => sum + (item.price ?? 0), 0),
      count: selectedItems.length,
      stores: new Set(selectedItems.map((item) => item.store)).size,
    };
  }, [offersByCardName, entries]);

  const handleDeleteList = useCallback(async () => {
    const ok = await confirm({
      title: `Delete ${listName || 'this list'}?`,
      description: 'This removes the list from your account. This action cannot be undone.',
      confirmLabel: 'Delete', tone: 'danger',
    });
    if (!ok) return;
    await removeList(listId);
    navigate({ to: '/lists' });
  }, [confirm, listName, listId, navigate, removeList]);

  const handleRemoveCard = useCallback(async (cardName: string) => {
    const ok = await confirm({
      title: `Remove ${cardName}?`, description: 'This removes one copy from the list.',
      confirmLabel: 'Remove', tone: 'danger',
    });
    if (ok) await removeCardFromList(listId, cardName);
  }, [confirm, listId, removeCardFromList]);

  const listSlug = useMemo(() => slugifyName(listName || listId), [listId, listName]);
  const openBuilder = useCallback((cardName?: string) => {
    navigate({
      to: '/build/$listId/$slug', params: { listId, slug: listSlug },
      search: cardName ? { card: cardName } : {},
    });
  }, [listId, listSlug, navigate]);

  if (!list && !loading) {
    return <Container maxWidth={false} sx={{ maxWidth: 1100 }}><EmptyState title="List not found" description="We couldn't find that list in your saved lists." action={<Button variant="outlined" onClick={() => navigate({ to: '/lists' })}>Back to Lists</Button>} /></Container>;
  }

  const meta = DECK_META[listName] ?? { colors: '', archetype: 'Custom', updated: 'recently' };
  return (
    <Container maxWidth={false} sx={{ maxWidth: 1100 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 3, mb: 3.5, flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          <Button onClick={() => navigate({ to: '/lists' })} startIcon={<ChevronLeft sx={{ fontSize: 14 }} />} sx={{ alignSelf: 'flex-start', py: 0.5, px: 1.25, fontSize: '0.78rem', color: 'text.secondary', minWidth: 0, mb: 0.75 }}>All lists</Button>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.75, flexWrap: 'wrap' }}>
            <ColorPips colors={meta.colors} size={32} />
            <Typography sx={{ fontSize: { xs: '2rem', md: '2.4rem' }, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1, m: 0, wordBreak: 'break-word' }}>{listName}</Typography>
          </Box>
          <Typography sx={{ fontSize: '0.92rem', color: 'text.secondary', mt: 0.75 }}>{colorIdentityName(meta.colors)} · {cards.length} cards</Typography>
        </Box>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Button variant="contained" color="primary" startIcon={<Construction sx={{ fontSize: 18 }} />} onClick={() => openBuilder()}>Build Cart</Button>
          <Button variant="outlined" color="primary" onClick={handleDeleteList}>Delete</Button>
        </Stack>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2, mb: 4 }}>
        <KpiTile label="Cart total" value={`CA$${cartSummary.total.toFixed(2)}`} delta={`${cartSummary.count} selected ${cartSummary.count === 1 ? 'offer' : 'offers'}`} />
        <KpiTile label="Cart stores" value={`${cartSummary.stores} ${cartSummary.stores === 1 ? 'store' : 'stores'}`} delta={cartSummary.count ? 'ready for checkout' : 'build your cart'} deltaTone={cartSummary.count ? 'good' : 'muted'} />
        <KpiTile label="Cards in cart" value={`${cartSummary.count} / ${entries.length}`} delta={cartSummary.count === entries.length ? 'every card selected' : `${entries.length - cartSummary.count} not in cart`} deltaTone={cartSummary.count === entries.length ? 'good' : 'muted'} />
      </Box>

      <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 3, boxShadow: 2 }}>
        <Typography variant="h3" sx={{ mb: 2.5 }}>Cards · {entries.length}</Typography>
        <Stack spacing={1}>
          {entries.map(({ name, qty }) => {
            const selectedItems = offersByCardName.get(normalizeCardName(name)) ?? [];
            const cartOffer = selectedOfferStatus(selectedItems);
            const first = selectedItems[0];
            const rowMeta = first
              ? `${first.set || '—'} · ${CONDITION_LABELS[first.condition] ?? first.condition}${selectedItems.length > 1 ? ` · ${selectedItems.length} offers` : ''}`
              : 'Not in cart';
            return <DecklistRow key={name} qty={qty} name={name} meta={rowMeta} cartOffer={cartOffer} onOpenBuilder={() => openBuilder(name)} onRemoveFromCart={() => selectedItems.forEach((item) => removeFromCart(cartItemId(item)))} onRemoveFromList={() => handleRemoveCard(name)} />;
          })}
        </Stack>
      </Paper>
    </Container>
  );
}
