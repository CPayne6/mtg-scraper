export interface TitleInfo {
  cardName: string;
  setName: string;
  collectorNumber?: string;
  /** Set code parsed from title when present (e.g., CG Realm's "(SET-NUM)") */
  setCode?: string;
  /** Foil flag parsed from title (e.g., trailing "Foil") */
  foil?: boolean;
}

export interface SkuInfo {
  setCode?: string;
  collectorNumber?: string;
  foil?: boolean;
  isToken?: boolean;
}

export interface TagsInfo {
  setName?: string;
  foil?: boolean;
}

export interface ImageInfo {
  setCode?: string;
  collectorNumber?: string;
}

/**
 * Extra structured data from product-level fields (vendor, body_html).
 * Higher-trust sources that override title/tag parsing when available.
 */
export interface ProductMetaInfo {
  /** Clean card name from structured HTML (e.g., body_html <span class="cardname">) */
  cardName?: string;
  /** Set name from vendor field or structured HTML */
  setName?: string;
}

export interface ICardDetailExtractor {
  parseTitle(title: string): TitleInfo;
  parseSkuInfo(sku?: string): SkuInfo;
  parseTags(tags?: string[] | string): TagsInfo;
  parseImageFilename(imageUrl?: string): ImageInfo;
  /** Parse product-level metadata fields. Optional — returns empty by default. */
  parseProductMeta?(vendor?: string, bodyHtml?: string): ProductMetaInfo;
}
