import * as cron from 'cron'

export interface Set {
  object: string
  id: string
  code: string
  mtgo_code?: string
  arena_code?: string
  name: string
  uri: string
  scryfall_uri: string
  search_uri: string
  released_at: string
  set_type: string
  card_count: number
  digital: boolean
  nonfoil_only: boolean
  foil_only: boolean
  icon_svg_uri: string
  tcgplayer_id?: number
  parent_set_code?: string
  block_code?: string
  block?: string
  printed_size?: number
}

let sets: Set[] = []

export const getSets = () => sets

export const isValidSetCode = (code: string) => {
  if (code.length <= 2) {
    return false
  }
  return sets.reduce(
    (prev, curr) => prev || curr.code.toLocaleLowerCase() === code.toLocaleLowerCase(),
    false
  )
}

export const loadSets = async () => {
  try {
    const response = await fetch('https://api.scryfall.com/sets')
    const data: unknown = await response.json()
    sets = (data as { data: Set[] }).data
    console.log(`Loaded ${sets.length} sets from Scryfall`)
    return sets
  } catch (err) {
    console.error('Failed to load sets from Scryfall:', err)
    // Don't crash - keep existing sets (or empty array on first load)
    return sets
  }
}

const job = new cron.CronJob('0 0 * * *', () => { loadSets() }, null, true, 'America/New_York', null, true)

export const cancelJob = () => {
  job.stop()
}
