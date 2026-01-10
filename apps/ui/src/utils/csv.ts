const fieldRegex = /(?<=^|,)((?:"([^"]*)")|([^,]*))(?=$|,)/gm

export const pruneQuotes = (str: string) => {
  if (str.indexOf(',') !== -1 && str.length > 2 && str.at(0) === '"' && str.at(str.length - 1) === '"') {
    return str.substring(1, str.length - 1)
  }
  return str
}

export function readCSVString<T extends Record<string, string>>(file: string) {
  const csv: T[] = []
  const [headers, ...splitRows] = file.split('\n')
  const keys = headers.match(fieldRegex)
  if (!keys) {
    console.error('Cannot read headers of CSV file:', splitRows[0])
    return []
  }
  splitRows.forEach((row, index) => {
    const values: string[] = row.match(fieldRegex) ?? []
    const objectRow = {}
    for (let i = 0; i < values.length && i < keys.length; i++) {
      // @ts-expect-error Does not like us storing in T typed object
      objectRow[keys[i]] = pruneQuotes(values[i])
    }
    csv.push(objectRow as T)
  })

  return csv
}
