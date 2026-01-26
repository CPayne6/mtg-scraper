export interface ConductCommerceSearchResponse {
  success: boolean;
  errors: string[];
  result: ConductCommerceSearchResult;
}

export interface ConductCommerceSearchResult {
  listings: ConductCommerceListing[];
  searchText: string;
  productTypeID: string;
  bundles: unknown[];
}

export interface ConductCommerceListing {
  inventoryID: number;
  categoryName: string;
  categoryUniqueDisplayName: string;
  inventoryName: string;
  image: string;
  variants: ConductCommerceVariant[];
  productTypeID: number;
  deliveryType: string;
  eventTime: string | null;
  domesticOnly: number;
  inStorePickupOnly: number;
  onlineOnly: number;
  filterFields: ConductCommerceFilterFields;
}

export interface ConductCommerceVariant {
  price: number;
  id: number | null;
  quantity: number;
  name: string;
  default: number;
  variantCombinationID: number;
  plantID: number;
}

export interface ConductCommerceFilterFields {
  Rarity?: string;
  Type?: string[];
  'Color Group'?: string;
  Finish?: string;
  Version?: string;
  Language?: string;
}