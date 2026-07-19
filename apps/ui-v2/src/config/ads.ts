/** Build-time configuration for the small number of manual ad placements. */
export const adsConfig = {
  enabled: import.meta.env.PROD && import.meta.env.VITE_ADS_ENABLED === 'true',
  clientId: import.meta.env.VITE_ADSENSE_CLIENT_ID?.trim() ?? '',
  cardResultsSlot: import.meta.env.VITE_AD_SLOT_CARD_RESULTS?.trim() ?? '',
  listResultsSlot: import.meta.env.VITE_AD_SLOT_LIST_RESULTS?.trim() ?? '',
} as const;

export const ADSENSE_SCRIPT_ID = 'scoutlgs-adsense-script';
export const ADSENSE_UNAVAILABLE_EVENT = 'scoutlgs:adsense-unavailable';
export const ADSENSE_UNAVAILABLE_FLAG = '__scoutlgsAdSenseUnavailable';

export function canServeAds() {
  return adsConfig.enabled && adsConfig.clientId.length > 0;
}
