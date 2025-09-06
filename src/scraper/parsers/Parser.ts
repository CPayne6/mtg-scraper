import { Card } from "../card.types";

export interface Parser {
  extractItems(data: string): Promise<{ result: Card[], error?: boolean | string }>
}
