export const ROW_GRADIENT =
  'linear-gradient(90deg, rgba(8, 12, 8, 0.88) 0%, rgba(8, 12, 8, 0.68) 40%, rgba(8, 12, 8, 0.35) 75%, rgba(8, 12, 8, 0.15) 100%)';

export function artUrl(name: string): string {
  return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=art_crop`;
}
