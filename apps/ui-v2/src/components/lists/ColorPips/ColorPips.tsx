import Box from '@mui/material/Box';
import { sortColors, scryfallPipSrc, MTG_COLOR_LABELS } from '@/data/colors';
import type { ColorPipsProps } from './ColorPips.types';

export function ColorPips({ colors, size = 18 }: ColorPipsProps) {
  const ordered = sortColors(colors || '').split('');
  const codes = ordered.length === 0 ? ['C'] : ordered;
  return (
    <Box
      component="span"
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, lineHeight: 1 }}
    >
      {codes.map((c) => (
        <Box
          key={c}
          component="img"
          src={scryfallPipSrc(c)}
          alt={MTG_COLOR_LABELS[c] ?? 'Colorless'}
          loading="lazy"
          width={size}
          height={size}
          sx={(theme) => ({
            display: 'inline-block',
            borderRadius: '50%',
            width: size,
            height: size,
            filter: theme.palette.iconShadow,
          })}
        />
      ))}
    </Box>
  );
}
