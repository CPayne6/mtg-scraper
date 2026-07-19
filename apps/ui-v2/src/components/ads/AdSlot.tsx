import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import {
  ADSENSE_UNAVAILABLE_EVENT,
  ADSENSE_UNAVAILABLE_FLAG,
  adsConfig,
  canServeAds,
} from '@/config/ads';

declare global {
  interface Window {
    adsbygoogle?: unknown[];
    __scoutlgsAdSenseUnavailable?: boolean;
  }
}

type AdSlotProps = {
  slot: string;
  ariaLabel: string;
};

/** A normal-flow, responsive manual AdSense display unit. */
export function AdSlot({ slot, ariaLabel }: AdSlotProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const adRef = useRef<HTMLModElement>(null);
  const requestedRef = useRef(false);
  const [collapsed, setCollapsed] = useState(() => Boolean(window[ADSENSE_UNAVAILABLE_FLAG]));

  // Development deliberately shows layout-only placeholders and never makes an ad request.
  if (!import.meta.env.PROD) {
    return (
      <Box
        aria-label={ariaLabel}
        sx={{
          minHeight: 100,
          border: '1px dashed',
          borderColor: 'divider',
          borderRadius: 1.5,
          display: 'grid',
          placeItems: 'center',
          color: 'text.secondary',
          fontSize: 12,
        }}
      >
        Advertisement · development placeholder
      </Box>
    );
  }

  const configured = canServeAds() && slot.length > 0;

  useEffect(() => {
    if (!configured) return;
    const collapse = () => setCollapsed(true);
    window.addEventListener(ADSENSE_UNAVAILABLE_EVENT, collapse);
    return () => window.removeEventListener(ADSENSE_UNAVAILABLE_EVENT, collapse);
  }, [configured]);

  useEffect(() => {
    if (!configured || collapsed) return;
    const container = containerRef.current;
    const ad = adRef.current;
    if (!container || !ad) return;

    const request = () => {
      if (requestedRef.current || container.getBoundingClientRect().width <= 0) return;
      requestedRef.current = true;
      ad.dataset.adsenseRequested = 'true';
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        if (ad.dataset.adStatus === 'unfilled') setCollapsed(true);
      } catch {
        // Blockers and unavailable scripts should leave no empty production panel.
        setCollapsed(true);
      }
    };

    request();
    const observer = new ResizeObserver(request);
    observer.observe(container);
    const statusObserver = new MutationObserver(() => {
      if (ad.dataset.adStatus === 'unfilled') setCollapsed(true);
    });
    statusObserver.observe(ad, { attributes: true, attributeFilter: ['data-ad-status'] });
    return () => {
      observer.disconnect();
      statusObserver.disconnect();
    };
  }, [collapsed, configured]);

  if (!configured || collapsed) return null;

  return (
    <Box ref={containerRef} component="section" aria-label={ariaLabel} sx={{ width: '100%', my: 4 }}>
      <Typography
        component="p"
        sx={{ fontSize: 11, color: 'text.secondary', letterSpacing: '0.06em', textTransform: 'uppercase', mb: 1 }}
      >
        Advertisement
      </Typography>
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={adsConfig.clientId}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </Box>
  );
}
