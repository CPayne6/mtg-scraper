
const defaultIdReplace = '{{id}}'
export const domainRegex = /https?:\/\/(\w+)\.\w+/i
export const defaultIdRegex = /decks\/(\w+)/

export abstract class DeckLoader {
  constructor(
    protected api: string,
    protected idReplace: string = defaultIdReplace,
    protected idRegex = defaultIdRegex
  ) { }

  protected replaceId(id: string) {
    return this.api.replaceAll(this.idReplace, id)
  }

  /**
   * Basic implementation meant to be overridden
   */
  protected abstract parseCardNames(data: string): string[]

  async fetchCards(link: string): Promise<string[]> {
    const id = this.idRegex.exec(link)?.[1]

    if (!id) {
      return []
    }

    const response = await fetch(this.replaceId(id))
    const data = await response.text()

    return this.parseCardNames(data)
  }
}
