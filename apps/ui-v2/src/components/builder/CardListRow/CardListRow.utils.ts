export const ROW_GRADIENT =
  'linear-gradient(90deg, rgba(8, 12, 8, 0.88) 0%, rgba(8, 12, 8, 0.68) 40%, rgba(8, 12, 8, 0.35) 75%, rgba(8, 12, 8, 0.15) 100%)';

const SCRYFALL_REQUEST_INTERVAL_MS = 125;

/** Rate-limits image endpoint requests to eight per second. */
export class ScryfallImageQueue {
  private nextStartAt = 0;

  enqueue(url: string): Promise<string> {
    const now = Date.now();
    const startAt = Math.max(now, this.nextStartAt);
    this.nextStartAt = startAt + SCRYFALL_REQUEST_INTERVAL_MS;

    return new Promise((resolve) => {
      setTimeout(() => resolve(url), startAt - now);
    });
  }
}

export const scryfallImageQueue = new ScryfallImageQueue();

export function artUrl(name: string): string {
  return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=art_crop`;
}
