import { useEffect, useRef } from 'react';
import { Box } from '@mui/material';
import { AD_CONFIG } from '../../config/ads';

// Load AdSense script only in production
let adsenseLoaded = false;
let adsenseBlocked = false;

function loadAdsenseScript(): Promise<boolean> {
  if (adsenseLoaded || AD_CONFIG.testMode) return Promise.resolve(true);
  if (adsenseBlocked) return Promise.resolve(false);

  return new Promise((resolve) => {
    adsenseLoaded = true;

    const script = document.createElement('script');
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${AD_CONFIG.clientId}`;
    script.async = true;
    script.crossOrigin = 'anonymous';

    script.onload = () => resolve(true);
    script.onerror = () => {
      console.warn('[AdUnit] AdSense script blocked or failed to load');
      adsenseBlocked = true;
      resolve(false);
    };

    document.head.appendChild(script);

    // Timeout fallback in case onload/onerror don't fire
    setTimeout(() => {
      if (!window.adsbygoogle) {
        adsenseBlocked = true;
        resolve(false);
      }
    }, 3000);
  });
}

function isAdsBlocked(): boolean {
  return adsenseBlocked;
}

export type AdFormat = 'banner' | 'skyscraper';

interface AdUnitProps {
  format: AdFormat;
  adSlot: string;
  testMode?: boolean;
}

const AD_DIMENSIONS = {
  banner: {
    width: { xs: 320, sm: 468, md: 728 },
    height: { xs: 50, sm: 60, md: 90 },
  },
  skyscraper: {
    width: 160,
    height: 600,
  },
} as const;

export function AdUnit({ format, adSlot, testMode = AD_CONFIG.testMode }: AdUnitProps) {
  // Debug log on every render
  console.log('[AdUnit] testMode:', testMode, '| AD_CONFIG.testMode:', AD_CONFIG.testMode, '| DEV:', import.meta.env.DEV);

  const adRef = useRef<HTMLModElement>(null);
  const isLoaded = useRef(false);

  useEffect(() => {
    console.log('[AdUnit useEffect] testMode:', testMode);
    if (testMode) return;

    let mounted = true;

    async function initAd() {
      console.log('[AdUnit] Loading AdSense script...');
      const loaded = await loadAdsenseScript();

      if (!mounted) return;

      if (!loaded) {
        console.log('[AdUnit] AdSense blocked or failed, skipping ad initialization');
        return;
      }

      if (adRef.current && !isLoaded.current) {
        try {
          (window.adsbygoogle = window.adsbygoogle || []).push({});
          isLoaded.current = true;
        } catch (error) {
          console.error('AdSense error:', error);
        }
      }
    }

    initAd();

    return () => {
      mounted = false;
    };
  }, [testMode]);

  const dimensions = AD_DIMENSIONS[format];

  if (testMode) {
    return (
      <Box
        sx={{
          width: format === 'banner' ? '100%' : dimensions.width,
          height: dimensions.height,
          bgcolor: 'action.hover',
          border: '2px dashed',
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'text.secondary',
          fontSize: '0.875rem',
          fontWeight: 500,
          borderRadius: 1,
        }}
      >
        Ad: {format === 'banner' ? 'Responsive Banner' : '160x600'}
      </Box>
    );
  }

  return (
    <Box
      sx={{
        width: format === 'banner' ? '100%' : dimensions.width,
        minHeight: dimensions.height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={{
          display: 'block',
          width: '100%',
          height: format === 'banner' ? 'auto' : 600,
        }}
        data-ad-client={AD_CONFIG.clientId}
        data-ad-slot={adSlot}
        data-ad-format={format === 'banner' ? 'horizontal' : 'vertical'}
        data-full-width-responsive="true"
      />
    </Box>
  );
}
