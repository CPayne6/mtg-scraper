import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import OpenInNew from '@mui/icons-material/OpenInNew';
import type { CardWithStore, Condition } from '@scoutlgs/shared';

type Props = {
  offer: CardWithStore;
  isCheapest?: boolean;
  inCart: boolean;
  onAdd: () => void;
};

type CondVisual = {
  label: string;
  bg: string;
  fg: string;
  border: string;
};

const CONDITION_DISPLAY: Record<Condition, string> = {
  nm: 'NM',
  pl: 'LP',
  mp: 'MP',
  hp: 'HP',
  unknown: 'DMG',
};

const CONDITION_TOOLTIP: Record<string, string> = {
  NM: 'Near Mint',
  LP: 'Lightly Played',
  MP: 'Moderately Played',
  HP: 'Heavily Played',
  DMG: 'Damaged',
};

function getCondVisual(label: string, isDark: boolean): CondVisual {
  if (isDark) {
    switch (label) {
      case 'NM':
        return {
          label,
          bg: 'rgba(110, 231, 183, 0.14)',
          fg: '#6ee7b7',
          border: 'rgba(110, 231, 183, 0.30)',
        };
      case 'LP':
        return {
          label,
          bg: 'rgba(102, 204, 255, 0.16)',
          fg: '#9cd0ff',
          border: 'rgba(102, 204, 255, 0.32)',
        };
      case 'MP':
        return {
          label,
          bg: 'rgba(255, 167, 38, 0.16)',
          fg: '#ffb86b',
          border: 'rgba(255, 167, 38, 0.32)',
        };
      case 'HP':
        return {
          label,
          bg: 'rgba(255, 99, 99, 0.16)',
          fg: '#ff9b9b',
          border: 'rgba(255, 99, 99, 0.32)',
        };
      default:
        return {
          label: 'DMG',
          bg: 'rgba(180, 180, 180, 0.14)',
          fg: '#b0b0b0',
          border: 'rgba(180, 180, 180, 0.32)',
        };
    }
  }
  switch (label) {
    case 'NM':
      return {
        label,
        bg: 'rgba(36, 135, 33, 0.14)',
        fg: '#2a6a27',
        border: 'rgba(36, 135, 33, 0.30)',
      };
    case 'LP':
      return {
        label,
        bg: 'rgba(2, 136, 209, 0.12)',
        fg: '#0a5b8a',
        border: 'rgba(2, 136, 209, 0.30)',
      };
    case 'MP':
      return {
        label,
        bg: 'rgba(237, 108, 2, 0.14)',
        fg: '#94440b',
        border: 'rgba(237, 108, 2, 0.32)',
      };
    case 'HP':
      return {
        label,
        bg: 'rgba(211, 47, 47, 0.12)',
        fg: '#962323',
        border: 'rgba(211, 47, 47, 0.32)',
      };
    default:
      return {
        label: 'DMG',
        bg: 'rgba(80, 80, 80, 0.14)',
        fg: '#444',
        border: 'rgba(80, 80, 80, 0.32)',
      };
  }
}

export function StoreOfferTile({ offer, isCheapest = false, inCart, onAdd }: Props) {
  const condLabel = CONDITION_DISPLAY[offer.condition] ?? 'DMG';
  const hasLink = Boolean(offer.link && offer.link.trim().length > 0);

  return (
    <Box
      sx={(theme) => ({
        position: 'relative',
        background: theme.palette.background.paper,
        borderRadius: '12px',
        padding: '14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        border: `1px solid ${
          isCheapest ? theme.palette.primary.main : theme.palette.divider
        }`,
        transition:
          'border-color 200ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 200ms cubic-bezier(0.4, 0, 0.2, 1), transform 200ms cubic-bezier(0.4, 0, 0.2, 1)',
        '&:hover': {
          borderColor: theme.palette.primary.main,
          boxShadow: theme.shadows[2],
          transform: 'translateY(-1px)',
        },
      })}
    >
      {isCheapest && (
        <Box
          component="span"
          sx={(theme) => ({
            position: 'absolute',
            top: '-8px',
            right: '12px',
            background: theme.palette.primary.main,
            color: '#fff',
            fontSize: '10px',
            fontWeight: 700,
            padding: '3px 8px',
            borderRadius: 999,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          })}
        >
          Cheapest
        </Box>
      )}

      <Typography sx={{ fontSize: '13px', fontWeight: 600 }}>{offer.store}</Typography>

      <Typography
        title={offer.set || ''}
        sx={{
          fontSize: '11px',
          color: 'text.secondary',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          mt: '-2px',
        }}
      >
        {offer.set || '—'}
      </Typography>

      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
        <Typography
          sx={(theme) => ({
            fontSize: '18px',
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            color: isCheapest ? theme.palette.primary.main : theme.palette.text.primary,
          })}
        >
          CA${offer.price.toFixed(2)}
        </Typography>
        <Box
          component="span"
          title={CONDITION_TOOLTIP[condLabel]}
          sx={(theme) => {
            const v = getCondVisual(condLabel, theme.palette.mode === 'dark');
            return {
              fontSize: '11px',
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: 999,
              letterSpacing: '0.06em',
              border: `1px solid ${v.border}`,
              background: v.bg,
              color: v.fg,
              flexShrink: 0,
            };
          }}
        >
          {condLabel}
        </Box>
      </Box>

      <Box
        sx={(theme) => ({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mt: '4px',
          pt: '8px',
          borderTop: `1px solid ${theme.palette.divider}`,
        })}
      >
        <Box
          component="a"
          href={hasLink ? offer.link : undefined}
          target={hasLink ? '_blank' : undefined}
          rel={hasLink ? 'noopener noreferrer' : undefined}
          onClick={(e: React.MouseEvent) => {
            if (!hasLink) e.preventDefault();
            e.stopPropagation();
          }}
          sx={(theme) => ({
            fontSize: '12px',
            fontWeight: 600,
            color: hasLink ? theme.palette.primary.main : theme.palette.text.disabled,
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            cursor: hasLink ? 'pointer' : 'default',
            pointerEvents: hasLink ? 'auto' : 'none',
            '&:hover': { textDecoration: hasLink ? 'underline' : 'none' },
          })}
        >
          View <OpenInNew sx={{ fontSize: 12 }} />
        </Box>
        {inCart ? (
          <Box
            component="span"
            sx={(theme) => ({
              padding: '6px 12px',
              borderRadius: '8px',
              border: 0,
              background:
                theme.palette.mode === 'dark'
                  ? 'rgba(36,135,33,0.16)'
                  : theme.palette.background.default,
              color:
                theme.palette.mode === 'dark'
                  ? '#248721'
                  : theme.palette.primary.main,
              fontWeight: 600,
              fontSize: '12px',
              cursor: 'default',
              userSelect: 'none',
            })}
          >
            {'✓ In Cart'}
          </Box>
        ) : (
          <Box
            component="button"
            onClick={(e) => {
              e.stopPropagation();
              onAdd();
            }}
            sx={(theme) => ({
              padding: '6px 12px',
              borderRadius: '8px',
              border: 0,
              background: theme.palette.primary.main,
              color: '#fff',
              fontWeight: 600,
              fontSize: '12px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'background 200ms cubic-bezier(0.4, 0, 0.2, 1)',
              '&:hover': {
                background:
                  theme.palette.mode === 'dark' ? '#1f7a1c' : '#3a5333',
              },
            })}
          >
            Add to Cart
          </Box>
        )}
      </Box>
    </Box>
  );
}
