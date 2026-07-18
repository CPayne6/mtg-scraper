/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_ADS_ENABLED?: string
  readonly VITE_ADSENSE_CLIENT_ID?: string
  readonly VITE_AD_SLOT_CARD_RESULTS?: string
  readonly VITE_AD_SLOT_LIST_RESULTS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
