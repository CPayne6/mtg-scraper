import { Card } from "@scoutlgs/shared";

export interface Parser {
  extractItems(data: string): Promise<{ result: Card[], error?: string }>
}
