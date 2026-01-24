// Debug: log environment mode
console.log('[ADS] import.meta.env.DEV:', import.meta.env.DEV);
console.log('[ADS] import.meta.env.MODE:', import.meta.env.MODE);

export const AD_CONFIG = {
  // Set to true during development to show placeholders instead of real ads
  testMode: import.meta.env.DEV === true,

  // AdSense client ID (publisher ID) - set via VITE_ADSENSE_CLIENT_ID env var
  clientId: import.meta.env.VITE_ADSENSE_CLIENT_ID || 'ca-pub-XXXXXXXXXX',

  // Ad slot IDs for different positions - set via env vars
  slots: {
    topBanner: import.meta.env.VITE_AD_SLOT_BANNER || '1234567890',
    leftSide: import.meta.env.VITE_AD_SLOT_LEFT || '2345678901',
    rightSide: import.meta.env.VITE_AD_SLOT_RIGHT || '3456789012',
  },
} as const;
