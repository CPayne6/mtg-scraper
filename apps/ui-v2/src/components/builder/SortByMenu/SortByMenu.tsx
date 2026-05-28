import { useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Popover from '@mui/material/Popover';
import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown';
import type { SortByMenuProps } from './SortByMenu.types';
import { OPTIONS } from './SortByMenu.utils';
import { triggerSx, popoverPaperSx, headingSx, optionSx } from './SortByMenu.styles';

export function SortByMenu({ value, onChange }: SortByMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const currentLabel = OPTIONS.find((o) => o.key === value)?.label ?? 'Name';

  return (
    <Box sx={{ display: 'inline-block' }}>
      <Box
        component="button"
        type="button"
        ref={triggerRef}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        sx={triggerSx(open)}
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
          paper: { sx: popoverPaperSx },
        }}
      >
        <Typography component="h6" sx={headingSx}>
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
              sx={optionSx(isSelected)}
            >
              <span>{opt.label}</span>
            </Box>
          );
        })}
      </Popover>
    </Box>
  );
}
