/* eslint-disable */

export interface HobbiesSearch {
  count: number
  additional_results: any[]
  products: Product[]
  current_page: number
  pages: number
}

export interface Product {
  id: string
  data_url: string
  description_preview: string
  name: string
  display_name: string
  vendor: string
  image_url: string
  url: string
  product_id: number
  productId: number
  variant_info: VariantInfo[]
  publisher: string
  msrp?: number
  price_text: string
  price: number
  proposed_price_change: any
  regular_price: any
  sale_price: number
  offer_price: number
  retail_price: number
  current_price: number
  inventoryLevels: InventoryLevel[]
  is_hot: boolean
  offer_price_override: boolean
  stock: number
  order_quantity_maximum: any
  productType: string
  price_updated_at_ago: string
  offer_price_updated_at_ago: string
  store_edit_url: string
  _id: string
  variantInfo: VariantInfo[]
  tags: string[]
  imageUrl: string
  selectedFinish?: string
  product_line: string
  productLine: string
  converted_price: number
  edit_url: string
  usd_price: number
  usd_price_text: string
  tcg_player_info: TcgPlayerInfo
}

export interface VariantInfo {
  id: number
  product_id: number
  title: string
  price: number
  position: number
  inventory_policy: string
  compare_at_price?: number
  option1: string
  option2: any
  option3: any
  created_at: string
  updated_at: string
  taxable: boolean
  barcode: string
  fulfillment_service: string
  grams: number
  inventory_management: string
  requires_shipping: boolean
  sku?: string
  weight: number
  weight_unit: string
  inventory_item_id: number
  inventory_quantity: number
  old_inventory_quantity: number
  admin_graphql_api_id: string
  image_id: any
  price_text: string
}

export interface InventoryLevel {
  inventory_item_id: number
  location_id: number
  available: number
  updated_at: string
  admin_graphql_api_id: string
}

export interface TcgPlayerInfo {
  url: string
}
