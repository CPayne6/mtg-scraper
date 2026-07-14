// Parses a free-form deck list (Arena, MTGO, plain text) into a flat array
// of card names where quantities are preserved as multiplicity. Comments,
// blank lines, sideboard markers, and Arena set suffixes are stripped.
//
//   "4 Lightning Bolt"          → ["Lightning Bolt", "Lightning Bolt", "Lightning Bolt", "Lightning Bolt"]
//   "1x Sol Ring"               → ["Sol Ring"]
//   "Lightning Bolt (M10) 146"  → ["Lightning Bolt"]
//   "// sideboard"              → skipped

const LINE_RE = /^\s*(\d+)?\s*[xX]?\s*([^()#\n]+?)(?:\s*\([^)]*\).*)?\s*$/;
const SIDEBOARD_MARKERS = ['sideboard', 'sb:', 'maybeboard', 'commander'];
const MAX_QTY_PER_LINE = 60;
export const MAX_DECKLIST_CARDS = 150;

export function parseDeckList(text: string): string[] {
  const names: string[] = [];
  for (const raw of text.split('\n')) {
    if (names.length >= MAX_DECKLIST_CARDS) break;
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('//') || line.startsWith('#')) continue;
    if (SIDEBOARD_MARKERS.some((m) => line.toLowerCase().startsWith(m))) continue;

    const match = LINE_RE.exec(line);
    if (!match) continue;
    const qty = Math.min(MAX_QTY_PER_LINE, Math.max(1, parseInt(match[1] ?? '1', 10)));
    const name = match[2]?.trim();
    if (!name) continue;
    for (let i = 0; i < qty; i++) {
      if (names.length >= MAX_DECKLIST_CARDS) break;
      names.push(name);
    }
  }
  return names;
}

export type DeckListEntry = { name: string; qty: number };

export function groupByName(names: string[]): DeckListEntry[] {
  const counts = new Map<string, number>();
  for (const name of names) {
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const entries: DeckListEntry[] = [];
  for (const [name, qty] of counts) entries.push({ name, qty });
  return entries;
}
