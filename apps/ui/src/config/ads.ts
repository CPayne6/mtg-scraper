export const AD_CONFIG = {
  // Set to true during development to show placeholders instead of real ads
  testMode: import.meta.env.DEV === true,

  // AdSense client ID (publisher ID)
  clientId: import.meta.env.VITE_ADSENSE_CLIENT_ID || 'ca-pub-9620141774867481',

  // Ad slot IDs for different positions (with fallback defaults)
  slots: {
    topBanner: import.meta.env.VITE_AD_SLOT_BANNER || '9625527706',
    leftSide: import.meta.env.VITE_AD_SLOT_LEFT || '3060119350',
    rightSide: import.meta.env.VITE_AD_SLOT_RIGHT || '4817205533',
  },
} as const;
