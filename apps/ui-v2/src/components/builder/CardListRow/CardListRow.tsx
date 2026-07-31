import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { Check } from '@mui/icons-material';
import { Close } from '@mui/icons-material';
import type { CardListRowProps } from './CardListRow.types';
import { ScryfallArtImage } from './ScryfallArtImage';
import {
  containerSx,
  gradientOverlaySx,
  selectedHighlightSx,
  innerSx,
  nameSx,
  cartPriceSx,
  inCartBadgeSx,
  removeBtnSx,
} from './CardListRow.styles';

export function CardListRow({
  name,
  selected,
  inCart,
  cartPrice,
  artScrollRoot,
  onSelect,
  onRemove,
}: CardListRowProps) {
  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      title={name + (inCart ? ' — in cart' : ' — not yet in cart')}
      sx={containerSx}
    >
      <ScryfallArtImage name={name} scrollRoot={artScrollRoot} />
      {/* Gradient overlay */}
      <Box aria-hidden="true" sx={gradientOverlaySx} />
      {/* This sits above the card art, so selection remains visible on bright artwork. */}
      {selected && <Box aria-hidden="true" sx={selectedHighlightSx} />}
      {/* Inner */}
      <Box sx={innerSx(inCart)}>
        <Box component="span" sx={nameSx}>
          {name}
        </Box>
      </Box>
      {/* Right-edge status / remove slot */}
      {inCart && cartPrice !== undefined && (
        <Box component="span" sx={cartPriceSx}>
          CA${cartPrice.toFixed(2)}
        </Box>
      )}
      {inCart ? (
        <Tooltip
          title="In cart — remove from cart first to delete from list"
          arrow
          placement="left"
        >
          <Box aria-label="In cart" sx={inCartBadgeSx}>
            <Check sx={{ fontSize: 14 }} />
          </Box>
        </Tooltip>
      ) : onRemove ? (
        <IconButton
          className="row-remove-btn"
          aria-label={`Remove ${name} from list`}
          title="Remove from list"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(name);
          }}
          sx={removeBtnSx}
        >
          <Close sx={{ fontSize: 14 }} />
        </IconButton>
      ) : null}
    </Box>
  );
}
