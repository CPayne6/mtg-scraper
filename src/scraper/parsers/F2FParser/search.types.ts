export interface F2FSearch {
  took: number
  timed_out: boolean
  _shards: Shards
  hits: Hits
  aggregations: Aggregations
  queryTier: string
  searchParams: SearchParams
}

export interface Shards {
  total: number
  successful: number
  skipped: number
  failed: number
}

export interface Hits {
  total: Total
  max_score: any
  hits: Hit[]
}

export interface Total {
  value: number
  relation: string
}

export interface Hit {
  _index: string
  _id: string
  _score: any
  _source: Source
  sort: number[]
}

export interface Source {
  title: string
  handle: string
  body_html: string
  minimum_price: number
  maximum_price: number
  variants: Variant[]
  media: Medum[]
  shopify_created_at: string
  product_type: string
  collections: string[]
  Brand: string[]
  publishedOnlineStore: number
  publishedF2FSell: number
  General_Card_Name: string
  General_Card_Text: string
  General_Game_Type: string[]
  General_Card_Language: string
  General_Release_Date: string
  General_ERP_Tab: string[]
  General_ERP_Warehouse_Location: string
  General_PreOrder_Availability: string
  MTG_Artist: string[]
  MTG_Card_Types: string[]
  MTG_Collector_Number: number
  MTG_Color?: string[]
  MTG_Color_Identity?: string[]
  MTG_Complete_Type_Line: string
  MTG_Foil_Option: string
  MTG_Mana_Cost_deconstructed: string[]
  MTG_Mana_Cost: string
  MTG_Mana_Value: number
  MTG_Legalities: string[]
  MTG_Rarity: string
  MTG_Set_Name: string
  MTG_Set_Filter: string
  Saleability_Online_Store: boolean
  General_Brand: string[]
  General_Release_Date_Time: string
  indexedAt: string
  "Card Name": string
  "Card Text": string
  "Game Type": string[]
  Language: string
  "Product Color": any[]
  "Sealed Product Type": any[]
  Tab: string[]
  Artist: string[]
  "Type Line": string[]
  "Collector Number": number
  Color: string[]
  Commander: string[]
  "Card Type": string
  Finish: string
  "Mana Cost": string
  "Format Legality": string[]
  Edition: any[]
  Rarity: string
  Set: string
  "Binder Type": any[]
  "Gamming Supply": any[]
  Size: any[]
  "Event Format": any[]
  "Event Day": any[]
  "Event Month": any[]
  "Event Location": any[]
  "Event Type": any[]
  "Alternate Art Qualifier": string[]
  General_Alternate_Art_Qualifier?: string[]
}

export interface Variant {
  id: string
  price: number
  compareAtPrice: string
  inventoryQuantity: number
  sku: string
  selectedOptions: SelectedOption[]
  image: Image
  translations: Translation[]
  sellPrice: number
}

export interface SelectedOption {
  name: string
  value: string
}

export interface Image {
  altText: any
  url: string
  width: number
}

export interface Translation {
  locale: string
  key: string
  value: string
}

export interface Medum {
  id: string
  url: string
  altText: string
  mediaContentType: string
}

export interface Aggregations {
  Availability: Availability
  Condition: Condition
  Game: Game
  Finish: Finish
  Set: Set
  Rarity: Rarity
  Color: Color
  Edition: Edition
  "Sealed Product Type": SealedProductType
  "Gaming Supply Type": GamingSupplyType
  "Binder Type": BinderType
  "Product Color": ProductColor
  Size: Size
  Language: Language
  "Event Format": EventFormat
  "Event Day": EventDay
  "Event Month": EventMonth
  "Event Location": EventLocation
  "Card Types": CardTypes
  "Product Type": ProductType
  "Alternate Art Qualifier": AlternateArtQualifier
  "Event Type": EventType
  Brand: Brand
}

export interface Availability {
  doc_count_error_upper_bound: number
  sum_other_doc_count: number
  buckets: Bucket[]
  show_on_search: boolean
  show_on_advance_search: boolean
}

export interface Bucket {
  key: string
  doc_count: number
  active?: boolean
}

export interface Condition {
  doc_count_error_upper_bound: number
  sum_other_doc_count: number
  buckets: Bucket2[]
  show_on_search: boolean
  show_on_advance_search: boolean
  show_on_buy_site: boolean
}

export interface Bucket2 {
  key: string
  doc_count: number
}

export interface Game {
  doc_count_error_upper_bound: number
  sum_other_doc_count: number
  buckets: Bucket3[]
  show_on_search: boolean
  show_on_advance_search: boolean
  show_on_buy_site: boolean
}

export interface Bucket3 {
  key: string
  doc_count: number
}

export interface Finish {
  doc_count_error_upper_bound: number
  sum_other_doc_count: number
  buckets: Bucket4[]
  show_on_search: boolean
  show_on_advance_search: boolean
  show_on_buy_site: boolean
}

export interface Bucket4 {
  key: string
  doc_count: number
}

export interface Set {
  doc_count_error_upper_bound: number
  sum_other_doc_count: number
  buckets: Bucket5[]
  show_on_search: boolean
  show_on_advance_search: boolean
  show_on_buy_site: boolean
}

export interface Bucket5 {
  key: string
  doc_count: number
}

export interface Rarity {
  doc_count_error_upper_bound: number
  sum_other_doc_count: number
  buckets: Bucket6[]
  show_on_search: boolean
  show_on_advance_search: boolean
  show_on_buy_site: boolean
}

export interface Bucket6 {
  key: string
  doc_count: number
}

export interface Color {
  doc_count_error_upper_bound: number
  sum_other_doc_count: number
  buckets: Bucket7[]
  show_on_search: boolean
  show_on_advance_search: boolean
  show_on_buy_site: boolean
}

export interface Bucket7 {
  key: string
  doc_count: number
}

export interface Edition {
  doc_count_error_upper_bound: number
  sum_other_doc_count: number
  buckets: any[]
  show_on_search: boolean
  show_on_advance_search: boolean
  show_on_buy_site: boolean
}

export interface SealedProductType {
  doc_count_error_upper_bound: number
  sum_other_doc_count: number
  buckets: any[]
  show_on_search: boolean
  show_on_advance_search: boolean
  show_on_buy_site: boolean
}

export interface GamingSupplyType {
  doc_count_error_upper_bound: number
  sum_other_doc_count: number
  buckets: any[]
  show_on_search: boolean
  show_on_advance_search: boolean
  show_on_buy_site: boolean
}

export interface BinderType {
  doc_count_error_upper_bound: number
  sum_other_doc_count: number
  buckets: any[]
  show_on_search: boolean
  show_on_advance_search: boolean
  show_on_buy_site: boolean
}

export interface ProductColor {
  doc_count_error_upper_bound: number
  sum_other_doc_count: number
  buckets: any[]
  show_on_search: boolean
  show_on_advance_search: boolean
  show_on_buy_site: boolean
}

export interface Size {
  doc_count_error_upper_bound: number
  sum_other_doc_count: number
  buckets: any[]
  show_on_search: boolean
  show_on_advance_search: boolean
  show_on_buy_site: boolean
}

export interface Language {
  doc_count_error_upper_bound: number
  sum_other_doc_count: number
  buckets: Bucket8[]
  show_on_search: boolean
  show_on_advance_search: boolean
  show_on_buy_site: boolean
}

export interface Bucket8 {
  key: string
  doc_count: number
}

export interface EventFormat {
  doc_count_error_upper_bound: number
  sum_other_doc_count: number
  buckets: any[]
  show_on_search: boolean
  show_on_advance_search: boolean
  show_on_buy_site: boolean
}

export interface EventDay {
  doc_count_error_upper_bound: number
  sum_other_doc_count: number
  buckets: any[]
  show_on_search: boolean
  show_on_advance_search: boolean
  show_on_buy_site: boolean
}

export interface EventMonth {
  doc_count_error_upper_bound: number
  sum_other_doc_count: number
  buckets: any[]
  show_on_search: boolean
  show_on_advance_search: boolean
  show_on_buy_site: boolean
}

export interface EventLocation {
  doc_count_error_upper_bound: number
  sum_other_doc_count: number
  buckets: any[]
  show_on_search: boolean
  show_on_advance_search: boolean
  show_on_buy_site: boolean
}

export interface CardTypes {
  doc_count_error_upper_bound: number
  sum_other_doc_count: number
  buckets: Bucket9[]
  show_on_search: boolean
  show_on_advance_search: boolean
  show_on_buy_site: boolean
}

export interface Bucket9 {
  key: string
  doc_count: number
}

export interface ProductType {
  doc_count_error_upper_bound: number
  sum_other_doc_count: number
  buckets: Bucket10[]
  show_on_search: boolean
  show_on_advance_search: boolean
  show_on_buy_site: boolean
}

export interface Bucket10 {
  key: string
  doc_count: number
}

export interface AlternateArtQualifier {
  doc_count_error_upper_bound: number
  sum_other_doc_count: number
  buckets: Bucket11[]
  show_on_search: boolean
  show_on_advance_search: boolean
  show_on_buy_site: boolean
}

export interface Bucket11 {
  key: string
  doc_count: number
}

export interface EventType {
  doc_count_error_upper_bound: number
  sum_other_doc_count: number
  buckets: any[]
  show_on_search: boolean
  show_on_advance_search: boolean
  show_on_buy_site: boolean
}

export interface Brand {
  doc_count_error_upper_bound: number
  sum_other_doc_count: number
  buckets: Bucket12[]
  show_on_search: boolean
  show_on_advance_search: boolean
  show_on_buy_site: boolean
}

export interface Bucket12 {
  key: string
  doc_count: number
}

export interface SearchParams {
  index: string
  body: Body
}

export interface Body {
  track_total_hits: string
  query: Query
  size: number
  from: number
  sort: Sort[]
  aggs: Aggs
}

export interface Query {
  bool: Bool
}

export interface Bool {
  must: Must[]
  should: any[]
  minimum_should_match: number
  filter: Filter2[]
}

export interface Must {
  bool: Bool2
}

export interface Bool2 {
  should: Should[]
  minimum_should_match: number
}

export interface Should {
  term?: Term
  bool?: Bool3
  nested?: Nested
}

export interface Term {
  "Saleability_Online_Store.case_insensitive_keyword": string
}

export interface Bool3 {
  should?: Should2[]
  minimum_should_match?: number
  must?: Must2[]
  boost?: number
  filter?: Filter[]
}

export interface Should2 {
  match: Match
}

export interface Match {
  "Collector Number.case_insensitive_keyword": CollectorNumberCaseInsensitiveKeyword
}

export interface CollectorNumberCaseInsensitiveKeyword {
  query: string
  boost: number
}

export interface Must2 {
  match: Match2
}

export interface Match2 {
  "Card Name"?: CardName
  Set?: Set2
}

export interface CardName {
  query: string
  operator: string
  fuzziness?: string
}

export interface Set2 {
  query: string
  operator: string
}

export interface Filter {
  script: Script
}

export interface Script {
  script: Script2
}

export interface Script2 {
  source: string
  params: Params
}

export interface Params {
  num_terms: number
}

export interface Nested {
  path: string
  query: Query2
}

export interface Query2 {
  bool: Bool4
}

export interface Bool4 {
  should: Should3[]
  minimum_should_match: number
}

export interface Should3 {
  term: Term2
}

export interface Term2 {
  "variants.sku.case_insensitive_keyword": string
}

export interface Filter2 {
  nested: Nested2
}

export interface Nested2 {
  path: string
  query: Query3
  inner_hits: InnerHits
}

export interface Query3 {
  bool: Bool5
}

export interface Bool5 {
  must: Must3[]
}

export interface Must3 {
  range: Range
}

export interface Range {
  "variants.inventoryQuantity": VariantsInventoryQuantity
}

export interface VariantsInventoryQuantity {
  gt: number
}

export interface InnerHits {}

export interface Sort {
  "variants.price": VariantsPrice
}

export interface VariantsPrice {
  order: string
  mode: string
  nested: Nested3
}

export interface Nested3 {
  path: string
}

export interface Aggs {
  Condition: Condition2
  Game: Game2
  Finish: Finish2
  Set: Set3
  Rarity: Rarity2
  Color: Color2
  Edition: Edition2
  "Sealed Product Type": SealedProductType2
  "Gaming Supply Type": GamingSupplyType2
  "Binder Type": BinderType2
  "Product Color": ProductColor2
  Size: Size2
  Language: Language2
  "Event Format": EventFormat2
  "Event Day": EventDay2
  "Event Month": EventMonth2
  "Event Location": EventLocation2
  "Format Legality": FormatLegality
  "Mana Cost": ManaCost
  "Card Type": CardType
  "Collector Number": CollectorNumber
  "Card Types": CardTypes2
  Artist: Artist
  Tab: Tab
  "Product Type": ProductType2
  Commander: Commander
  "Alternate Art Qualifier": AlternateArtQualifier2
  "Event Type": EventType2
  Brand: Brand2
  Availability: Availability2
}

export interface Condition2 {
  terms: Terms
}

export interface Terms {
  field: string
  size: number
}

export interface Game2 {
  terms: Terms2
}

export interface Terms2 {
  field: string
  size: number
}

export interface Finish2 {
  terms: Terms3
}

export interface Terms3 {
  field: string
  size: number
}

export interface Set3 {
  terms: Terms4
}

export interface Terms4 {
  field: string
  size: number
}

export interface Rarity2 {
  terms: Terms5
}

export interface Terms5 {
  field: string
  size: number
}

export interface Color2 {
  terms: Terms6
}

export interface Terms6 {
  field: string
  size: number
  order: Order
}

export interface Order {
  _key: string
}

export interface Edition2 {
  terms: Terms7
}

export interface Terms7 {
  field: string
  size: number
}

export interface SealedProductType2 {
  terms: Terms8
}

export interface Terms8 {
  field: string
  size: number
}

export interface GamingSupplyType2 {
  terms: Terms9
}

export interface Terms9 {
  field: string
  size: number
}

export interface BinderType2 {
  terms: Terms10
}

export interface Terms10 {
  field: string
  size: number
}

export interface ProductColor2 {
  terms: Terms11
}

export interface Terms11 {
  field: string
  size: number
}

export interface Size2 {
  terms: Terms12
}

export interface Terms12 {
  field: string
  size: number
}

export interface Language2 {
  terms: Terms13
}

export interface Terms13 {
  field: string
  size: number
}

export interface EventFormat2 {
  terms: Terms14
}

export interface Terms14 {
  field: string
  size: number
}

export interface EventDay2 {
  terms: Terms15
}

export interface Terms15 {
  field: string
  size: number
}

export interface EventMonth2 {
  terms: Terms16
}

export interface Terms16 {
  field: string
  size: number
}

export interface EventLocation2 {
  terms: Terms17
}

export interface Terms17 {
  field: string
  size: number
}

export interface FormatLegality {
  terms: Terms18
}

export interface Terms18 {
  field: string
  size: number
}

export interface ManaCost {
  terms: Terms19
}

export interface Terms19 {
  field: string
  size: number
}

export interface CardType {
  terms: Terms20
}

export interface Terms20 {
  field: string
  size: number
}

export interface CollectorNumber {
  terms: Terms21
}

export interface Terms21 {
  field: string
  size: number
}

export interface CardTypes2 {
  terms: Terms22
}

export interface Terms22 {
  field: string
  size: number
}

export interface Artist {
  terms: Terms23
}

export interface Terms23 {
  field: string
  size: number
}

export interface Tab {
  terms: Terms24
}

export interface Terms24 {
  field: string
  size: number
}

export interface ProductType2 {
  terms: Terms25
}

export interface Terms25 {
  field: string
  size: number
}

export interface Commander {
  terms: Terms26
}

export interface Terms26 {
  field: string
  size: number
}

export interface AlternateArtQualifier2 {
  terms: Terms27
}

export interface Terms27 {
  field: string
  size: number
}

export interface EventType2 {
  terms: Terms28
}

export interface Terms28 {
  field: string
  size: number
}

export interface Brand2 {
  terms: Terms29
}

export interface Terms29 {
  field: string
  size: number
}

export interface Availability2 {
  nested: Nested4
  aggs: Aggs2
}

export interface Nested4 {
  path: string
}

export interface Aggs2 {
  Availability: Availability3
}

export interface Availability3 {
  terms: Terms30
  aggs: Aggs3
}

export interface Terms30 {
  script: Script3
}

export interface Script3 {
  source: string
}

export interface Aggs3 {
  parent_count: ParentCount
}

export interface ParentCount {
  reverse_nested: ReverseNested
}

export interface ReverseNested {}
