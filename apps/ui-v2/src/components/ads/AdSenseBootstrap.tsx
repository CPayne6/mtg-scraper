import { useEffect } from 'react';
import {
  ADSENSE_SCRIPT_ID,
  ADSENSE_UNAVAILABLE_EVENT,
  ADSENSE_UNAVAILABLE_FLAG,
  adsConfig,
  canServeAds,
} from '@/config/ads';

/** Loads the AdSense library once for the SPA, only in an enabled production build. */
export function AdSenseBootstrap() {
  useEffect(() => {
    if (!canServeAds()) return;

    const existing = document.getElementById(ADSENSE_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) return;

    const script = document.createElement('script');
    script.id = ADSENSE_SCRIPT_ID;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(adsConfig.clientId)}`;
    script.onerror = () => {
      window[ADSENSE_UNAVAILABLE_FLAG] = true;
      window.dispatchEvent(new Event(ADSENSE_UNAVAILABLE_EVENT));
    };
    document.head.appendChild(script);
  }, []);

  return null;
}
