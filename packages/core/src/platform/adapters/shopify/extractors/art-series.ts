/**
 * Art Series products are not playable Magic cards, even though merchants
 * commonly prefix their titles with the corresponding card name. Stores use
 * both "Art Series" and "Art Card" (with spaces, hyphens, or underscores)
 * for these products.
 */
export function isArtSeriesTitle(title: string): boolean {
  return /\bart[\s_-]*(?:series|card)\b/i.test(title);
}
