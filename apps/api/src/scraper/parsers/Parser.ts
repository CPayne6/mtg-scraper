import { Card } from "@mtg-scraper/shared";

export interface Parser {
  extractItems(data: string): Promise<{ result: Card[], error?: boolean | string }>
}
