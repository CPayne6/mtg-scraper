import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Close from '@mui/icons-material/Close';
import { ColorPips } from '@/components/lists/ColorPips';
import { colorIdentityName } from '@/data/colors';
import type { DeckCardProps } from './DeckCard.types';
import { gradientForColors } from './DeckCard.utils';
import { containerSx, deleteBtnSx, titleSx, footerSx } from './DeckCard.styles';

export function DeckCard({
  name,
  colors,
  archetype,
  count,
  updated,
  onOpen,
  onDelete,
}: DeckCardProps) {
  const gradient = gradientForColors(colors);
  return (
    <Paper
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen();
      }}
      sx={containerSx(gradient)}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <ColorPips colors={colors} size={26} />
        <Tooltip title="Delete">
          <IconButton
            size="small"
            className="deck-card-more"
            aria-label={`Delete ${name}`}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            sx={deleteBtnSx}
          >
            <Close sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      </Box>
      <Box sx={{ flex: 1, mb: 2 }}>
        <Typography sx={titleSx}>{name}</Typography>
        <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', mt: 0.5 }}>
          {colorIdentityName(colors)} · {archetype}
        </Typography>
      </Box>
      <Box sx={footerSx}>
        <Box component="span" sx={{ fontWeight: 600, color: 'primary.main' }}>
          {count} {count === 1 ? 'card' : 'cards'}
        </Box>
        <Box component="span" sx={{ color: 'text.secondary' }}>
          Updated {updated}
        </Box>
      </Box>
    </Paper>
  );
}
