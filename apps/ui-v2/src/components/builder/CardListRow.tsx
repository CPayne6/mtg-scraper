import Box from '@mui/material/Box';

type Props = {
  name: string;
  selected: boolean;
  inCart: boolean;
  onSelect: () => void;
};

const ROW_GRADIENT =
  'linear-gradient(90deg, rgba(8, 12, 8, 0.88) 0%, rgba(8, 12, 8, 0.68) 40%, rgba(8, 12, 8, 0.35) 75%, rgba(8, 12, 8, 0.15) 100%)';

function artUrl(name: string): string {
  return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=art_crop`;
}

export function CardListRow({ name, selected, inCart, onSelect }: Props) {
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
      sx={(theme) => ({
        position: 'relative',
        height: 46,
        mb: '4px',
        borderRadius: '6px',
        overflow: 'hidden',
        cursor: 'pointer',
        bgcolor: '#161616',
        transition:
          'transform 120ms cubic-bezier(0.4, 0, 0.2, 1), outline-color 200ms cubic-bezier(0.4, 0, 0.2, 1)',
        isolation: 'isolate',
        outline: selected
          ? `2px solid ${theme.palette.honey.main}`
          : '0 solid transparent',
        outlineOffset: selected ? '-2px' : 0,
        '&:hover': { transform: 'translateX(2px)' },
      })}
    >
      {/* Art bg */}
      <Box
        aria-hidden="true"
        sx={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url("${artUrl(name)}")`,
          backgroundSize: 'cover',
          backgroundPosition: 'center 35%',
          backgroundRepeat: 'no-repeat',
        }}
      />
      {/* Gradient overlay */}
      <Box
        aria-hidden="true"
        sx={{
          position: 'absolute',
          inset: 0,
          background: ROW_GRADIENT,
        }}
      />
      {/* Inner */}
      <Box
        sx={{
          position: 'relative',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          padding: '0 32px 0 14px',
          zIndex: 1,
        }}
      >
        <Box
          component="span"
          sx={{
            color: '#fff',
            fontWeight: 600,
            fontSize: '13px',
            letterSpacing: '-0.005em',
            textShadow: '0 1px 3px rgba(0, 0, 0, 0.7)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {name}
        </Box>
      </Box>
      {/* Unread honey dot */}
      {!inCart && (
        <Box
          aria-label="Not in cart"
          sx={(theme) => ({
            position: 'absolute',
            top: '50%',
            right: '12px',
            transform: 'translateY(-50%)',
            width: 9,
            height: 9,
            borderRadius: '50%',
            background: theme.palette.honey.main,
            boxShadow:
              '0 0 0 2px rgba(0, 0, 0, 0.55), 0 0 10px rgba(212, 165, 116, 0.7)',
            zIndex: 3,
            pointerEvents: 'none',
          })}
        />
      )}
    </Box>
  );
}
