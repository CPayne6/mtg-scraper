import { Box } from '@mui/material';
import { AdUnit } from './AdUnit';

interface SideAdProps {
  adSlot: string;
  position: 'left' | 'right';
  testMode?: boolean;
}

export function SideAd({ adSlot, position, testMode }: SideAdProps) {
  return (
    <Box
      sx={{
        width: 160,
        flexShrink: 0,
        position: 'sticky',
        top: 120,
        alignSelf: 'flex-start',
        display: { xs: 'none', lg: 'block' },
      }}
    >
      <AdUnit format="skyscraper" adSlot={adSlot} testMode={testMode} />
    </Box>
  );
}
