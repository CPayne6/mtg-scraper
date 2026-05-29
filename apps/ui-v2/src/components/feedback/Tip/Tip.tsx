import type { ReactNode } from 'react';
import Box from '@mui/material/Box';

export function Tip({ children }: { children: ReactNode }) {
  return (
    <Box
      component="span"
      sx={(theme) => ({
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        px: 1.25,
        py: 0.75,
        borderLeft: `3px solid ${theme.palette.honey.main}`,
        bgcolor: theme.palette.honey.light,
        borderRadius: 0.5,
        color: 'text.secondary',
        fontSize: '0.875rem',
        lineHeight: 1.5,
      })}
    >
      <Box component="span">💡 Tip: {children}</Box>
    </Box>
  );
}
