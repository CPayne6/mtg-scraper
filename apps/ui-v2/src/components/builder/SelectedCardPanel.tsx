import { useMemo } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';
import Alert from '@mui/material/Alert';
import type { CardWithStore, Condition } from '@scoutlgs/shared';
import { StoreOfferTile } from './StoreOfferTile';
import type { PriceLookupState } from '@/hooks/useListPrices';

type Props = {
  card: { name: string; set?: string } | null;
  lookup: PriceLookupState | undefined;
  selectedStores: string[];
  conditions: string[];
  inCartByOffer: (offer: CardWithStore) => boolean;
  onAddOffer: (offer: CardWithStore) => void;
};

const CONDITION_TO_LABEL: Record<Condition, string> = {
  nm: 'NM',
  pl: 'LP',
  mp: 'MP',
  hp: 'HP',
  unknown: 'DMG',
};

function previewUrl(name: string): string {
  return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=normal`;
}

export function SelectedCardPanel({
  card,
  lookup,
  selectedStores,
  conditions,
  inCartByOffer,
  onAddOffer,
}: Props) {
  const filteredOffers = useMemo(() => {
    if (!lookup || lookup.state !== 'success') return [] as CardWithStore[];
    const storeSet = new Set(selectedStores);
    const condSet = new Set(conditions);
    return lookup.offers
      .filter((o) => (storeSet.size === 0 ? false : storeSet.has(o.store)))
      .filter((o) => {
        if (condSet.size === 0) return true;
        const label = CONDITION_TO_LABEL[o.condition] ?? 'DMG';
        return condSet.has(label);
      })
      .sort((a, b) => a.price - b.price);
  }, [lookup, selectedStores, conditions]);

  const anyOfferInCart = useMemo(
    () => filteredOffers.some((o) => inCartByOffer(o)),
    [filteredOffers, inCartByOffer],
  );

  // Empty-list state
  if (!card) {
    return (
      <Paper
        sx={{
          py: '36px',
          px: '24px',
          textAlign: 'center',
          color: 'text.secondary',
          fontSize: '14px',
          borderRadius: '16px',
        }}
      >
        Pick a card on the right to compare prices.
      </Paper>
    );
  }

  // Derive set name from the cheapest selected offer (fall back to card.set, then to '—').
  const setName =
    (lookup?.state === 'success' && lookup.cheapest?.set) ||
    card.set ||
    '—';
  const storeCount = filteredOffers.length;

  return (
    <>
      {/* Sticky header card */}
      <Box
        sx={(theme) => ({
          bgcolor: 'background.paper',
          borderRadius: '16px',
          boxShadow: theme.shadows[2],
          padding: '16px 20px',
          position: { xs: 'static', lg: 'sticky' },
          top: { lg: 148 },
          zIndex: 5,
          display: 'flex',
          alignItems: 'flex-start',
          gap: '16px',
        })}
      >
        {/* Preview thumb */}
        <Box
          aria-hidden="true"
          sx={(theme) => ({
            width: 124,
            aspectRatio: '5 / 7',
            backgroundImage: `url("${previewUrl(card.name)}")`,
            backgroundColor: theme.palette.background.default,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            borderRadius: '9px',
            flexShrink: 0,
            boxShadow:
              theme.palette.mode === 'dark'
                ? '0 10px 28px -4px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.22)'
                : '0 8px 22px -4px rgba(0,0,0,0.16), 0 3px 10px rgba(0,0,0,0.08)',
          })}
        />

        {/* Meta column */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ mb: '6px' }}>
            <Box
              component="span"
              sx={(theme) => ({
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: anyOfferInCart
                  ? theme.palette.text.secondary
                  : theme.palette.mode === 'dark'
                    ? theme.palette.honey.main
                    : theme.palette.honey.dark,
              })}
            >
              <Box
                component="span"
                aria-hidden="true"
                sx={(theme) => ({
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: anyOfferInCart ? 'transparent' : theme.palette.honey.main,
                  boxShadow: anyOfferInCart
                    ? 'none'
                    : '0 0 6px rgba(212, 165, 116, 0.7)',
                  transition:
                    'background 200ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 200ms cubic-bezier(0.4, 0, 0.2, 1)',
                })}
              />
              {anyOfferInCart ? 'In your cart' : 'Not yet in cart'}
            </Box>
          </Box>

          <Typography
            variant="h5"
            sx={{
              fontWeight: 700,
              letterSpacing: '-0.01em',
              m: 0,
              mb: '8px',
              fontSize: '22px',
              lineHeight: 1.2,
            }}
          >
            {card.name}
          </Typography>

          <Box
            sx={{
              fontSize: '13px',
              color: 'text.secondary',
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '6px',
            }}
          >
            <Box
              component="span"
              sx={{ color: 'text.primary', fontWeight: 600 }}
              title={setName}
            >
              {setName}
            </Box>
            <Box component="span" sx={{ color: 'text.disabled' }}>
              ·
            </Box>
            <Box component="span">
              {storeCount} {storeCount === 1 ? 'store' : 'stores'} scouted
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Stores section */}
      <Box>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            padding: '0 4px',
            mb: '10px',
          }}
        >
          <Typography
            component="h3"
            sx={{
              fontSize: '14px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'text.secondary',
              m: 0,
            }}
          >
            Add to Cart · {filteredOffers.length}{' '}
            {filteredOffers.length === 1 ? 'store' : 'stores'}
          </Typography>
          <Box sx={{ fontSize: '12px', color: 'text.secondary' }}>
            💡 Tip: Cheapest store is highlighted.
          </Box>
        </Box>

        {lookup?.state === 'pending' && (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: '12px',
            }}
          >
            {[0, 1, 2].map((i) => (
              <Skeleton
                key={i}
                variant="rectangular"
                height={132}
                sx={{ borderRadius: '12px', bgcolor: 'background.paper' }}
              />
            ))}
          </Box>
        )}

        {lookup?.state === 'error' && (
          <Alert severity="error" sx={{ borderRadius: '12px' }}>
            {lookup.message}
          </Alert>
        )}

        {lookup?.state === 'success' && filteredOffers.length === 0 && (
          <Paper
            sx={{
              py: '24px',
              px: '24px',
              textAlign: 'center',
              color: 'text.secondary',
              fontSize: '13px',
              borderRadius: '12px',
            }}
          >
            No copies of {card.name} match your store and condition filters.
          </Paper>
        )}

        {lookup?.state === 'success' && filteredOffers.length > 0 && (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: '12px',
            }}
          >
            {filteredOffers.map((offer, idx) => (
              <StoreOfferTile
                key={`${offer.store}|${offer.set}|${offer.condition}|${offer.price}`}
                offer={offer}
                isCheapest={idx === 0}
                inCart={inCartByOffer(offer)}
                onAdd={() => onAddOffer(offer)}
              />
            ))}
          </Box>
        )}
      </Box>
    </>
  );
}
