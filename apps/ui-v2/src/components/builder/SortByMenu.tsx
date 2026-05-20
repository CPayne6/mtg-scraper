import { useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Popover from '@mui/material/Popover';
import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown';

export type SortBy = 'name' | 'price';

type Props = {
  value: SortBy;
  onChange: (v: SortBy) => void;
};

const OPTIONS: { key: SortBy; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'price', label: 'Price' },
];

export function SortByMenu({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const currentLabel = OPTIONS.find((o) => o.key === value)?.label ?? 'Name';

  return (
    <Box sx={{ display: 'inline-block' }}>
      <Box
        component="button"
        ref={triggerRef}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        sx={(theme) => ({
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          background: theme.palette.background.default,
          color: theme.palette.text.primary,
          border: `1px solid ${
            open ? 'rgba(74, 103, 65, 0.35)' : theme.palette.divider
          }`,
          borderRadius: '8px',
          padding: '5px 10px 5px 12px',
          fontSize: '12px',
          fontWeight: 600,
          fontFamily: 'inherit',
          cursor: 'pointer',
          transition:
            'background 200ms cubic-bezier(0.4, 0, 0.2, 1), border-color 200ms cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            background: theme.palette.background.paper,
            borderColor:
              theme.palette.mode === 'dark'
                ? 'rgba(36, 135, 33, 0.5)'
                : 'rgba(74, 103, 65, 0.35)',
          },
        })}
      >
        <span>{currentLabel}</span>
        <KeyboardArrowDown sx={{ fontSize: 14, opacity: 0.7 }} />
      </Box>
      <Popover
        open={open}
        anchorEl={triggerRef.current}
        onClose={() => setOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: (theme) => ({
              minWidth: 160,
              bgcolor: 'background.paper',
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: '12px',
              boxShadow: theme.shadows[6],
              p: '12px',
              mt: '8px',
            }),
          },
        }}
      >
        <Typography
          component="h6"
          sx={{
            fontSize: '11px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'text.secondary',
            m: 0,
            mb: '8px',
          }}
        >
          Sort by
        </Typography>
        {OPTIONS.map((opt) => {
          const isSelected = opt.key === value;
          return (
            <Box
              key={opt.key}
              role="option"
              aria-selected={isSelected}
              onClick={() => {
                onChange(opt.key);
                setOpen(false);
              }}
              sx={(theme) => ({
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '7px 8px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '13px',
                userSelect: 'none',
                background: isSelected
                  ? theme.palette.mode === 'dark'
                    ? 'rgba(36, 135, 33, 0.18)'
                    : 'rgba(74, 103, 65, 0.08)'
                  : 'transparent',
                '&:hover': { background: theme.palette.background.default },
              })}
            >
              <span>{opt.label}</span>
            </Box>
          );
        })}
      </Popover>
    </Box>
  );
}
