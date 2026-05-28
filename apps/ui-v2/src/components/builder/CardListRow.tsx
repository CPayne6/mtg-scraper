import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Check from '@mui/icons-material/Check';
import Close from '@mui/icons-material/Close';

type Props = {
  name: string;
  selected: boolean;
  inCart: boolean;
  onSelect: () => void;
  onRemove?: (cardName: string) => void;
};

const ROW_GRADIENT =
  'linear-gradient(90deg, rgba(8, 12, 8, 0.88) 0%, rgba(8, 12, 8, 0.68) 40%, rgba(8, 12, 8, 0.35) 75%, rgba(8, 12, 8, 0.15) 100%)';

function artUrl(name: string): string {
  return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=art_crop`;
}

export function CardListRow({
  name,
  selected,
  inCart,
  onSelect,
  onRemove,
}: Props) {
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
        '&:hover .row-remove-btn, &:focus-within .row-remove-btn': {
          opacity: 1,
        },
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
          padding: '0 42px 0 14px',
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
      {/* Right-edge status / remove slot */}
      {inCart ? (
        <Tooltip
          title="In cart — remove from cart first to delete from list"
          arrow
          placement="left"
        >
          <Box
            aria-label="In cart"
            sx={(theme) => ({
              position: 'absolute',
              top: '50%',
              right: 8,
              transform: 'translateY(-50%)',
              width: 26,
              height: 26,
              borderRadius: '6px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'not-allowed',
              color: '#fff',
              zIndex: 2,
              background:
                theme.palette.mode === 'dark'
                  ? theme.palette.primary.main
                  : 'rgba(74, 103, 65, 0.92)',
              boxShadow:
                theme.palette.mode === 'dark'
                  ? '0 0 0 2px rgba(255,255,255,0.12)'
                  : '0 0 0 2px rgba(255,255,255,0.18)',
            })}
          >
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
          sx={{
            position: 'absolute',
            top: '50%',
            right: 8,
            transform: 'translateY(-50%)',
            width: 26,
            height: 26,
            padding: 0,
            borderRadius: '6px',
            background: 'rgba(0,0,0,0.45)',
            color: 'rgba(255,255,255,0.9)',
            opacity: 0.85,
            zIndex: 2,
            transition:
              'opacity 120ms cubic-bezier(0.4, 0, 0.2, 1), background 120ms cubic-bezier(0.4, 0, 0.2, 1), color 120ms cubic-bezier(0.4, 0, 0.2, 1)',
            '&:hover': {
              opacity: 1,
              background: 'rgba(180, 40, 40, 0.85)',
              color: '#fff',
            },
          }}
        >
          <Close sx={{ fontSize: 14 }} />
        </IconButton>
      ) : null}
    </Box>
  );
}
