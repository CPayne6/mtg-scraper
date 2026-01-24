import { useEffect, useRef, useState } from 'react';
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

type AdStatus = 'loading' | 'loaded' | 'failed';

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
  const adRef = useRef<HTMLModElement>(null);
  const isLoaded = useRef(false);
  const [status, setStatus] = useState<AdStatus>('loading');

  useEffect(() => {
    if (testMode || !adSlot) return;

    // If AdSense is already known to be blocked, fail immediately
    if (adsenseBlocked) {
      setStatus('failed');
      return;
    }

    let mounted = true;
    let resizeObserver: ResizeObserver | null = null;
    let checkTimeout: ReturnType<typeof setTimeout> | null = null;

    function checkAdLoaded() {
      // Check if the ad actually rendered content after a delay
      checkTimeout = setTimeout(() => {
        if (!mounted) return;
        if (adRef.current) {
          // Check if the ins element has any rendered ad content (iframe or filled status)
          const hasContent = adRef.current.querySelector('iframe') !== null;
          const dataAdStatus = adRef.current.getAttribute('data-ad-status');
          if (hasContent || dataAdStatus === 'filled') {
            setStatus('loaded');
          } else if (dataAdStatus === 'unfilled') {
            setStatus('failed');
          } else {
            // Give it more time, then fail
            setTimeout(() => {
              if (!mounted) return;
              const hasContentLater = adRef.current?.querySelector('iframe') !== null;
              setStatus(hasContentLater ? 'loaded' : 'failed');
            }, 3000);
          }
        }
      }, 2000);
    }

    async function initAd() {
      const loaded = await loadAdsenseScript();

      if (!mounted) return;

      if (!loaded) {
        setStatus('failed');
        return;
      }

      if (adRef.current && !isLoaded.current) {
        // Check if container has width before pushing ad
        const containerWidth = adRef.current.offsetWidth;
        if (containerWidth > 0) {
          try {
            (window.adsbygoogle = window.adsbygoogle || []).push({});
            isLoaded.current = true;
            checkAdLoaded();
          } catch (error) {
            console.error('AdSense error:', error);
            setStatus('failed');
          }
        } else {
          // Wait for container to have width using ResizeObserver
          resizeObserver = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry && entry.contentRect.width > 0 && !isLoaded.current && mounted) {
              try {
                (window.adsbygoogle = window.adsbygoogle || []).push({});
                isLoaded.current = true;
                checkAdLoaded();
              } catch (error) {
                console.error('AdSense error:', error);
                setStatus('failed');
              }
              resizeObserver?.disconnect();
            }
          });
          resizeObserver.observe(adRef.current);
        }
      }
    }

    initAd();

    return () => {
      mounted = false;
      resizeObserver?.disconnect();
      if (checkTimeout) clearTimeout(checkTimeout);
    };
  }, [testMode, adSlot]);

  const dimensions = AD_DIMENSIONS[format];

  // Hide ad if it failed to load
  if (status === 'failed') {
    return null;
  }

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
