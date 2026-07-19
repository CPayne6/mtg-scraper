// Seed data used by Card Lists when nothing is in localStorage yet, plus
// metadata fallbacks (archetype, color identity) for lists without one.

export type DeckMeta = {
  colors: string;
  archetype: string;
  updated: string;
};

export type StoreFacet = {
  key: string;
  label: string;
  count: number;
  baseUrl: string;
};

export const SEED_LISTS: Record<string, string[]> = {
  AtraxaSuperfriends: [
    'Atraxa, Grand Unifier',
    'Sol Ring',
    'Cyclonic Rift',
    'Smothering Tithe',
    'Doubling Season',
  ],
  BurnPauper: ['Lightning Bolt', 'Lava Spike', 'Fireblast', 'Chain Lightning'],
  MonoBlueTempo: ['Counterspell', 'Brainstorm', 'Snapcaster Mage', 'Force of Will'],
  GolgariMidrange: ['Tarmogoyf', 'Thoughtseize', 'Liliana of the Veil', 'Birds of Paradise'],
  BorosAggro: ['Lightning Bolt', 'Path to Exile', 'Goblin Guide', 'Monastery Swiftspear'],
};

export const DECK_META: Record<string, DeckMeta> = {
  AtraxaSuperfriends: { colors: 'WUBG', archetype: 'Superfriends · Commander', updated: '2 days ago' },
  BurnPauper:         { colors: 'R',    archetype: 'Burn · Pauper',            updated: '1 week ago' },
  MonoBlueTempo:      { colors: 'U',    archetype: 'Tempo · Modern',           updated: '3 weeks ago' },
  GolgariMidrange:    { colors: 'BG',   archetype: 'Midrange · Modern',        updated: 'today' },
  BorosAggro:         { colors: 'WR',   archetype: 'Aggro · Standard',         updated: 'yesterday' },
};

// Store facet defaults. `key` is the API slug (matches `store_key` on each
// offer) and is the only thing used for filtering/grouping/keying. `label` is
// the human-readable name used in UI text. Never filter on `label`.
export const STORE_FACETS: StoreFacet[] = [
  { key: '401-games', label: '401 Games', count: 1, baseUrl: 'https://store.401games.ca' },
  { key: 'face-to-face-games', label: 'Face to Face Games', count: 1, baseUrl: 'https://facetofacegames.com' },
  { key: 'hobbiesville', label: 'Hobbiesville', count: 1, baseUrl: 'https://hobbiesville.com' },
  { key: 'black-knight-games', label: 'Black Knight Games', count: 1, baseUrl: 'https://blackknightgames.ca' },
  { key: 'exor-games', label: 'Exor Games', count: 1, baseUrl: 'https://exorgames.com' },
  { key: 'game-knight', label: 'Game Knight', count: 1, baseUrl: 'https://gameknight.ca' },
  { key: 'house-of-cards', label: 'House of Cards', count: 1, baseUrl: 'https://houseofcards.ca' },
  { key: 'the-cg-realm', label: 'The CG Realm', count: 1, baseUrl: 'https://www.thecgrealm.com' },
];

export const DEFAULT_STORE_KEYS = STORE_FACETS.map((store) => store.key);

export const FALLBACK_CARDS = [
  'Lightning Bolt', 'Atraxa, Grand Unifier', 'Sol Ring', 'Cyclonic Rift',
  'Smothering Tithe', 'Doubling Season', 'Esper Sentinel', 'Counterspell',
  'Brainstorm', 'Black Lotus', 'Mox Ruby', 'Mox Sapphire',
  'Force of Will', 'Wrath of God', 'Path to Exile', 'Swords to Plowshares',
  'Demonic Tutor', 'Mana Crypt', 'Time Walk', 'Ancestral Recall',
  'Snapcaster Mage', 'Liliana of the Veil', 'Thoughtseize',
  'Birds of Paradise', 'Llanowar Elves', 'Tarmogoyf',
];
