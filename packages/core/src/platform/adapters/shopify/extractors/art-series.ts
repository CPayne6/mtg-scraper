/**
 * Art Series products are not playable Magic cards, even though merchants
 * commonly prefix their titles with the corresponding card name.
 */
export function isArtSeriesTitle(title: string): boolean {
  return /\bArt Series\b/i.test(title);
}
