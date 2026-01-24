import { Box } from '@mui/material';
import { AdUnit } from './AdUnit';

interface BannerAdProps {
  adSlot: string;
  testMode?: boolean;
}

export function BannerAd({ adSlot, testMode }: BannerAdProps) {
  return (
    <Box
      sx={{
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <AdUnit format="banner" adSlot={adSlot} testMode={testMode} />
    </Box>
  );
}
