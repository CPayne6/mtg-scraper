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
    let mutationObserver: MutationObserver | null = null;
    let fallbackTimeout: ReturnType<typeof setTimeout> | null = null;

    function checkAdStatus() {
      if (!mounted || !adRef.current) return;

      const dataAdStatus = adRef.current.getAttribute('data-ad-status');
      if (dataAdStatus === 'filled') {
        setStatus('loaded');
        return true;
      } else if (dataAdStatus === 'unfilled') {
        setStatus('failed');
        return true;
      }
      return false;
    }

    function watchForAdLoad() {
      if (!adRef.current) return;

      // Check immediately in case ad already loaded/failed
      if (checkAdStatus()) return;

      // Watch for iframe insertion and data-ad-status attribute changes
      mutationObserver = new MutationObserver((mutations) => {
        if (!mounted) return;

        for (const mutation of mutations) {
          // Check for attribute changes on the ins element
          if (mutation.type === 'attributes' && mutation.attributeName === 'data-ad-status') {
            if (checkAdStatus()) {
              mutationObserver?.disconnect();
              return;
            }
          }

          // Check for added iframes
          if (mutation.type === 'childList') {
            for (const node of mutation.addedNodes) {
              if (node instanceof HTMLIFrameElement) {
                // Listen for load/error on the iframe
                node.addEventListener('load', () => {
                  if (!mounted) return;
                  // After iframe loads, check if it has content or shows an error
                  // Give it a moment to render, then check data-ad-status
                  setTimeout(() => {
                    if (!mounted) return;
                    if (!checkAdStatus()) {
                      // If no status set, check iframe dimensions as fallback
                      const iframeHeight = node.offsetHeight;
                      if (iframeHeight > 0) {
                        setStatus('loaded');
                      } else {
                        setStatus('failed');
                      }
                    }
                  }, 500);
                });

                node.addEventListener('error', () => {
                  if (!mounted) return;
                  setStatus('failed');
                  mutationObserver?.disconnect();
                });
              }
            }
          }
        }
      });

      mutationObserver.observe(adRef.current, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-ad-status'],
      });

      // Fallback: if nothing happens after 5 seconds, assume failure
      fallbackTimeout = setTimeout(() => {
        if (!mounted) return;
        if (!checkAdStatus()) {
          const iframe = adRef.current?.querySelector('iframe');
          if (iframe && iframe.offsetHeight > 0) {
            setStatus('loaded');
          } else {
            setStatus('failed');
          }
        }
        mutationObserver?.disconnect();
      }, 5000);
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
            watchForAdLoad();
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
                watchForAdLoad();
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
      mutationObserver?.disconnect();
      if (fallbackTimeout) clearTimeout(fallbackTimeout);
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
