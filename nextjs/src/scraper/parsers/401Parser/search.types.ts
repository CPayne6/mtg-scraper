/* eslint-disable */

export interface _401Search {
  uuid: string
  items: Item[]
  total_results: number
  term: string
  sort_by: string
  p: number
  total_p: number
  narrow: string[][]
  alternatives: any[]
  results_for: any
  isp_quick_view_mode: number
  auto_facets: boolean
  related_results: boolean
  hybrid: boolean
}

export interface Item {
  l: string
  c: string
  u: string
  p: string
  p_min: string
  p_max: string
  p_c: string
  p_min_c: string
  p_max_c: string
  d: string
  t: string
  t2: string
  f: number
  s: string
  sku: string
  p_spl: number
  c_date: number
  id: string
  skus: string[]
  v_c: number
  iso: boolean
  vra: [number, [string, any[]][]][]
  vrc: Vrc
  att: [string, any[]][]
  v: string
}

export interface Vrc {}
