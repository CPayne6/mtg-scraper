import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import type { KpiTileProps } from './KpiTile.types';

export function KpiTile({ label, value, delta, deltaTone = 'muted' }: KpiTileProps) {
  return (
    <Paper
      sx={(theme) => ({
        p: '20px 22px',
        borderRadius: 2,
        boxShadow: theme.shadows[2],
        display: 'flex',
        flexDirection: 'column',
        gap: 0.5,
      })}
    >
      <Typography
        sx={{
          fontSize: 11,
          fontWeight: 600,
          color: 'text.secondary',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: '2.25rem',
          fontWeight: 700,
          letterSpacing: '-0.01em',
          lineHeight: 1,
          mt: '4px',
        }}
      >
        {value}
      </Typography>
      {delta && (
        <Typography
          sx={(theme) => ({
            fontSize: 13,
            mt: '2px',
            color:
              deltaTone === 'good'
                ? theme.palette.mode === 'dark'
                  ? '#6dcf69'
                  : theme.palette.primary.main
                : 'text.secondary',
            fontWeight: deltaTone === 'good' ? 600 : 400,
          })}
        >
          {delta}
        </Typography>
      )}
    </Paper>
  );
}
