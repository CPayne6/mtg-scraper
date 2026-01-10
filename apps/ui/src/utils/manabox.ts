import { LibraryEntry } from "@/components"
import { readCSVString } from "./csv"

export type ExportKey = 'Binder Name' | 'Binder Type' | 'Name' | 'Set code' | 'Set name' | 'Collector number' | 'Foil' | 'Rarity' | 'Quantity' | 'ManaBox ID' | 'Scryfall ID' | 'Purchase price' | 'Misprint' | 'Altered' | 'Condition' | 'Language' | 'Purchase price currency'

export type ManaboxCsvExport = Record<ExportKey, string>

export const cardTxtRegex = /^(\d+) (.+) \((\w+)\) (\d+)( \*F\*)?$/

export const parseManaboxCsv = (content: string): LibraryEntry[] => {
  const parsed = readCSVString<ManaboxCsvExport>(content)

  return parsed.map((item) => ({
    condition: item['Condition'],
    name: item['Name'],
    set: item['Set code'],
    foil: Boolean(item['Foil']),
    scryfall_id: item['Scryfall ID']
  }))
}

export const parseManaboxTxt = (content: string): LibraryEntry[] => {
  const rows = content.split('\n')
  return rows.map((row) => {
    const [_match, _quantity, name, setCode, _collectorNumber, foil] = row.match(cardTxtRegex) || []
    return {
      name,
      set: setCode,
      foil: !!foil
    }
  })
}
