import { Box } from '@mui/material';
import { BannerAd, SideAd } from '../Ads';
import { AD_CONFIG } from '../../config/ads';

interface PageLayoutProps {
  children: React.ReactNode;
  showAds?: boolean;
  showTopBanner?: boolean;
}

export function PageLayout({ children, showAds = true, showTopBanner = true }: PageLayoutProps) {
  const { testMode, slots } = AD_CONFIG;

  return (
    <Box sx={{ width: '100%' }}>
      {showAds && showTopBanner && (
        <Box sx={{ mb: { xs: 2, md: 3 } }}>
          <BannerAd adSlot={slots.topBanner} testMode={testMode} />
        </Box>
      )}

      <Box
        sx={{
          display: 'flex',
          width: '100%',
        }}
      >
        {showAds && (
          <SideAd adSlot={slots.leftSide} position="left" testMode={testMode} />
        )}

        <Box sx={{ flex: 1, minWidth: 0, px: { xs: 0, lg: 4 } }}>{children}</Box>

        {showAds && (
          <SideAd adSlot={slots.rightSide} position="right" testMode={testMode} />
        )}
      </Box>

      {/* Bottom banner ad - visible on mobile/tablet when side ads are hidden */}
      {showAds && (
        <Box sx={{ mt: { xs: 2, md: 3 }, display: { xs: 'block', lg: 'none' } }}>
          <BannerAd adSlot={slots.leftSide} testMode={testMode} />
        </Box>
      )}
    </Box>
  );
}
