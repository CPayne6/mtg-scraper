import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import { KeyboardArrowLeft, KeyboardArrowRight } from '@mui/icons-material';
import type { CardWithStore } from '@scoutlgs/shared';
import { StoreOfferTile } from '../StoreOfferTile';
import type { SelectedCardPanelProps } from './SelectedCardPanel.types';
import {
  CONDITION_TO_LABEL,
  offerKey,
  scryfallPreviewUrl,
} from './SelectedCardPanel.utils';
import {
  cardNameSx,
  cardNavButtonSx,
  cardNavPositionSx,
  cardNavSx,
  cartStatusBadgeSx,
  cartStatusDotSx,
  emptyListPaperSx,
  emptyResultsPaperSx,
  headerCardSx,
  metaRowSx,
  offerGridSx,
  previewThumbSx,
  sectionHeaderSx,
  sectionTitleSx,
} from './SelectedCardPanel.styles';

export function SelectedCardPanel({
  card,
  lookup,
  selectedStores,
  conditions,
  inCartByOffer,
  onAddOffer,
  positionLabel,
  canSelectPrevious = false,
  canSelectNext = false,
  onSelectPrevious,
  onSelectNext,
}: SelectedCardPanelProps) {
  const [hoveredOfferKey, setHoveredOfferKey] = useState<string | null>(null);

  const filteredOffers = useMemo(() => {
    if (!lookup || lookup.state !== 'success') return [] as CardWithStore[];
    const storeSet = new Set(selectedStores);
    const condSet = new Set(conditions);
    return lookup.offers
      .filter((o) => (storeSet.size === 0 ? false : storeSet.has(o.store_key)))
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

  // Cheapest offer is the default preview source; hovered offer overrides it.
  // Falls back to the Scryfall named-image lookup when no offers are loaded.
  const cheapestOffer = filteredOffers[0];
  const hoveredOffer = hoveredOfferKey
    ? filteredOffers.find((o) => offerKey(o) === hoveredOfferKey) ?? null
    : null;
  const previewOffer = hoveredOffer ?? cheapestOffer ?? null;
  const previewImage =
    previewOffer?.image ||
    (card && scryfallPreviewUrl(card.name)) ||
    '';

  if (!card) {
    return (
      <Paper sx={emptyListPaperSx}>
        Pick a card on the right to compare prices.
      </Paper>
    );
  }

  const setName =
    (lookup?.state === 'success' && lookup.cheapest?.set) || card.set || '—';
  const storeCount = filteredOffers.length;

  return (
    <>
      {/* Sticky header card */}
      <Box sx={headerCardSx}>
        <Box aria-hidden="true" sx={previewThumbSx(previewImage)} />

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ mb: '6px' }}>
            <Box component="span" sx={cartStatusBadgeSx(anyOfferInCart)}>
              <Box component="span" aria-hidden="true" sx={cartStatusDotSx(anyOfferInCart)} />
              {anyOfferInCart ? 'In your cart' : 'Not yet in cart'}
            </Box>
          </Box>

          <Typography variant="h5" sx={cardNameSx}>
            {card.name}
          </Typography>

          <Box sx={metaRowSx}>
            <Box component="span" sx={{ color: 'text.primary', fontWeight: 600 }} title={setName}>
              {setName}
            </Box>
            <Box component="span" sx={{ color: 'text.disabled' }}>·</Box>
            <Box component="span">
              {storeCount} {storeCount === 1 ? 'store' : 'stores'} scouted
            </Box>
          </Box>

          {positionLabel && (
            <Box sx={cardNavSx}>
              <Button
                type="button"
                variant="outlined"
                color="primary"
                size="small"
                startIcon={<KeyboardArrowLeft sx={{ fontSize: 17 }} />}
                disabled={!canSelectPrevious}
                onClick={onSelectPrevious}
                sx={cardNavButtonSx}
              >
                Previous Card
              </Button>
              <Box component="span" sx={cardNavPositionSx}>
                {positionLabel}
              </Box>
              <Button
                type="button"
                variant="outlined"
                color="primary"
                size="small"
                endIcon={<KeyboardArrowRight sx={{ fontSize: 17 }} />}
                disabled={!canSelectNext}
                onClick={onSelectNext}
                sx={cardNavButtonSx}
              >
                Next Card
              </Button>
            </Box>
          )}
        </Box>
      </Box>

      {/* Stores section */}
      <Box>
        <Box sx={sectionHeaderSx}>
          <Typography component="h3" sx={sectionTitleSx}>
            Add to Cart · {filteredOffers.length}{' '}
            {filteredOffers.length === 1 ? 'store' : 'stores'}
          </Typography>
          <Box sx={{ fontSize: '12px', color: 'text.secondary' }}>
            💡 Tip: Cheapest store is highlighted.
          </Box>
        </Box>

        {lookup?.state === 'pending' && (
          <Box sx={offerGridSx}>
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
          <Paper sx={emptyResultsPaperSx}>
            No copies of {card.name} match your store and condition filters.
          </Paper>
        )}

        {lookup?.state === 'success' && filteredOffers.length > 0 && (
          <Box sx={offerGridSx}>
            {filteredOffers.map((offer, idx) => {
              const k = offerKey(offer);
              return (
                <StoreOfferTile
                  key={`${k}|${idx}`}
                  offer={offer}
                  isCheapest={idx === 0}
                  inCart={inCartByOffer(offer)}
                  onAdd={() => onAddOffer(offer)}
                  onHoverStart={() => setHoveredOfferKey(k)}
                  onHoverEnd={() =>
                    setHoveredOfferKey((curr) => (curr === k ? null : curr))
                  }
                />
              );
            })}
          </Box>
        )}
      </Box>
    </>
  );
}
