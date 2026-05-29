import type { Condition } from '@scoutlgs/shared';
import type { CondVisual } from './StoreOfferTile.types';

// `dmg` and `unknown` are distinct: a damaged card is graded; an unknown card
// is one whose condition the scraper couldn't determine.
export const CONDITION_DISPLAY: Record<Condition, string> = {
  nm: 'NM',
  lp: 'LP',
  mp: 'MP',
  hp: 'HP',
  dmg: 'DMG',
  unknown: 'Unknown',
};

export const CONDITION_TOOLTIP: Record<string, string> = {
  NM: 'Near Mint',
  LP: 'Lightly Played',
  MP: 'Moderately Played',
  HP: 'Heavily Played',
  DMG: 'Damaged',
  Unknown: 'Condition not reported by the store',
};

const DARK_VISUALS: Record<string, CondVisual> = {
  NM: { label: 'NM', bg: 'rgba(110, 231, 183, 0.14)', fg: '#6ee7b7', border: 'rgba(110, 231, 183, 0.30)' },
  LP: { label: 'LP', bg: 'rgba(102, 204, 255, 0.16)', fg: '#9cd0ff', border: 'rgba(102, 204, 255, 0.32)' },
  MP: { label: 'MP', bg: 'rgba(255, 167, 38, 0.16)', fg: '#ffb86b', border: 'rgba(255, 167, 38, 0.32)' },
  HP: { label: 'HP', bg: 'rgba(255, 99, 99, 0.16)', fg: '#ff9b9b', border: 'rgba(255, 99, 99, 0.32)' },
  DMG: { label: 'DMG', bg: 'rgba(180, 180, 180, 0.14)', fg: '#b0b0b0', border: 'rgba(180, 180, 180, 0.32)' },
  Unknown: { label: 'Unknown', bg: 'rgba(120, 120, 120, 0.12)', fg: '#cbcbcb', border: 'rgba(160, 160, 160, 0.30)' },
};

const LIGHT_VISUALS: Record<string, CondVisual> = {
  NM: { label: 'NM', bg: 'rgba(36, 135, 33, 0.14)', fg: '#2a6a27', border: 'rgba(36, 135, 33, 0.30)' },
  LP: { label: 'LP', bg: 'rgba(2, 136, 209, 0.12)', fg: '#0a5b8a', border: 'rgba(2, 136, 209, 0.30)' },
  MP: { label: 'MP', bg: 'rgba(237, 108, 2, 0.14)', fg: '#94440b', border: 'rgba(237, 108, 2, 0.32)' },
  HP: { label: 'HP', bg: 'rgba(211, 47, 47, 0.12)', fg: '#962323', border: 'rgba(211, 47, 47, 0.32)' },
  DMG: { label: 'DMG', bg: 'rgba(80, 80, 80, 0.14)', fg: '#444', border: 'rgba(80, 80, 80, 0.32)' },
  Unknown: { label: 'Unknown', bg: 'rgba(120, 120, 120, 0.10)', fg: '#555', border: 'rgba(120, 120, 120, 0.32)' },
};

const FALLBACK_DARK: CondVisual = { label: 'Unknown', bg: 'rgba(120, 120, 120, 0.12)', fg: '#cbcbcb', border: 'rgba(160, 160, 160, 0.30)' };
const FALLBACK_LIGHT: CondVisual = { label: 'Unknown', bg: 'rgba(120, 120, 120, 0.10)', fg: '#555', border: 'rgba(120, 120, 120, 0.32)' };

export function getCondVisual(label: string, isDark: boolean): CondVisual {
  const table = isDark ? DARK_VISUALS : LIGHT_VISUALS;
  return table[label] ?? (isDark ? FALLBACK_DARK : FALLBACK_LIGHT);
}
