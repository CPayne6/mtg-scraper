export interface BinderPOSSearch {
  limit: number
  offset: number
  currentFilters: CurrentFilters
  count: number
  products: Product[]
}

export interface CurrentFilters {
  id: any
  name: any
  notes: any
  storeUrl: string
  game: string
  title: string
  setNames: any
  strict: boolean
  instockOnly: boolean
  colors: any
  types: any
  rarities: any
  monsterTypes: any
  priceOverrideType: any
  priceGreaterThan: number
  priceLessThan: any
  overallQuantityGreaterThan: any
  overallQuantityLessThan: any
  quantityGreaterThan: any
  quantityLessThan: any
  tags: any
  vendors: any
  productTypes: any
  specialTraits: any
  eras: any
  fabClasses: any
  editions: any
  subTypes: any
  gameCharacters: any
  finishes: any
  barcode: any
  sku: any
  variants: any
  sortTypes: SortType[]
  limit: number
  offset: number
}

export interface SortType {
  type: string
  asc: boolean
  order: number
}

export interface Product {
  id: number
  variants: Variant[]
  event: any
  shopifyId: number
  selectedVariant: number
  overallQuantity: number
  img: string
  tcgImage: string
  title: string
  vendor: string
  tags: string
  handle: string
  productType: string
  metaFieldsGlobalDescriptionTag: any
  metaFieldsGlobalTitleTag: any
  templateSuffix: any
  name: any
  setName: string
  setCode: string
  rarity: string
  cardName: string
  cardTitle: string
  cardNumber: string
  collectorNumber: string
  extendedName: any
  supportedCatalog: boolean
}

export interface Variant {
  id: number
  shopifyId: number
  productTitle: any
  tcgImage: any
  collectorNumber: any
  img: any
  title: string
  barcode?: string
  sku: string
  price: number
  cashBuyPrice: any
  storeCreditBuyPrice: any
  maxPurchaseQuantity: any
  canPurchaseOverstock: any
  creditOverstockBuyPrice: any
  overtStockBuyPrice: any
  quantity: number
  reserveQuantity: number
  position: number
  taxable: any
  taxCode: any
  option1: string
  option2: any
  option3: any
  fulfillmentService: string
  priceOverride: any
  cashBuyPercent: any
  creditBuyPercent: any
  maxInstockBuyPrice: any
  maxInstockBuyPercentage: any
  maxInstockCreditBuyPrice: any
  maxInstockCreditBuyPercentage: any
  variantSyncSettings: any
}
