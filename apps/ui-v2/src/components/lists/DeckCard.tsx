import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Close from '@mui/icons-material/Close';
import { ColorPips } from '@/components/lists/ColorPips';
import { colorIdentityName, sortColors } from '@/data/colors';

type Props = {
  name: string;
  colors: string;
  archetype: string;
  count: number;
  updated: string;
  onOpen: () => void;
  onDelete: () => void;
};

function gradientForColors(colors: string): string {
  const sorted = sortColors(colors || '');
  switch (sorted) {
    case 'W':
      return 'linear-gradient(135deg, #f8f0c0, transparent 60%)';
    case 'U':
      return 'linear-gradient(135deg, #a3c4e8, transparent 60%)';
    case 'B':
      return 'linear-gradient(135deg, #888, transparent 60%)';
    case 'R':
      return 'linear-gradient(135deg, #e8a08a, transparent 60%)';
    case 'G':
      return 'linear-gradient(135deg, #a3c8a3, transparent 60%)';
    case 'WR':
      return 'linear-gradient(135deg, #f8f0c0, #e8a08a 70%, transparent)';
    case 'WG':
      return 'linear-gradient(135deg, #f8f0c0, #a3c8a3 70%, transparent)';
    case 'BG':
      return 'linear-gradient(135deg, #a3c8a3, #555 70%, transparent)';
    case 'UB':
      return 'linear-gradient(135deg, #a3c4e8, #555 70%, transparent)';
    case 'UR':
      return 'linear-gradient(135deg, #a3c4e8, #e8a08a 70%, transparent)';
    case 'WUBG':
      return 'linear-gradient(135deg, #f8f0c0, #a3c4e8, #555, #a3c8a3)';
    default:
      if (sorted.length >= 2) {
        // generic dual-or-more — chain known stops in order
        const stopMap: Record<string, string> = {
          W: '#f8f0c0',
          U: '#a3c4e8',
          B: '#555',
          R: '#e8a08a',
          G: '#a3c8a3',
        };
        const stops = sorted.split('').map((c) => stopMap[c]).filter(Boolean);
        return `linear-gradient(135deg, ${stops.join(', ')})`;
      }
      return 'linear-gradient(135deg, #ccc, transparent 60%)';
  }
}

export function DeckCard({
  name,
  colors,
  archetype,
  count,
  updated,
  onOpen,
  onDelete,
}: Props) {
  const gradient = gradientForColors(colors);
  return (
    <Paper
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen();
      }}
      sx={(theme) => ({
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        p: '18px 20px',
        borderRadius: 2,
        border: `1px solid ${theme.palette.divider}`,
        cursor: 'pointer',
        overflow: 'hidden',
        isolation: 'isolate',
        transition: 'transform 200ms, box-shadow 200ms, border-color 200ms',
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          background: gradient,
          opacity: theme.palette.mode === 'dark' ? 0.1 : 0.06,
          zIndex: -1,
          pointerEvents: 'none',
        },
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: theme.shadows[3],
          borderColor: theme.palette.primary.main,
        },
        '&:hover .deck-card-more': { opacity: 1 },
      })}
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
            sx={{
              width: 26,
              height: 26,
              opacity: 0,
              transition: 'opacity 200ms, background 200ms, color 200ms',
              '&:hover': { color: 'error.main', bgcolor: 'rgba(244,67,54,0.10)' },
            }}
          >
            <Close sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      </Box>
      <Box sx={{ flex: 1, mb: 2 }}>
        <Typography
          sx={{
            fontSize: '1.1rem',
            fontWeight: 700,
            letterSpacing: '-0.005em',
            m: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name}
        </Typography>
        <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', mt: 0.5 }}>
          {colorIdentityName(colors)} · {archetype}
        </Typography>
      </Box>
      <Box
        sx={(theme) => ({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          pt: 1.5,
          borderTop: `1px solid ${theme.palette.divider}`,
          fontSize: '0.74rem',
        })}
      >
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
