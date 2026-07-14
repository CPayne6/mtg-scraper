import Box from '@mui/material/Box';
import { InfoOutlined } from '@mui/icons-material';

export function StaleNotice() {
  return (
    <Box
      sx={(theme) => ({
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1,
        py: 1,
        px: 1.75,
        borderRadius: 1.25,
        bgcolor: theme.palette.honey.light,
        color: 'text.primary',
        fontSize: '0.82rem',
        lineHeight: 1.4,
        borderLeft: `3px solid ${theme.palette.honey.main}`,
        maxWidth: 640,
      })}
    >
      <InfoOutlined sx={{ fontSize: 16 }} />
      <Box component="span">
        Card prices may be slightly out of date.
      </Box>
    </Box>
  );
}
