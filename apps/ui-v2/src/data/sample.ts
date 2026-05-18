// Seed data used by Card Lists when nothing is in localStorage yet, plus
// metadata fallbacks (archetype, color identity) for lists without one.

export type DeckMeta = {
  colors: string;
  archetype: string;
  updated: string;
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

export const STORE_FACETS = [
  { name: '401 Games', count: 1 },
  { name: 'Face to Face', count: 1 },
  { name: 'Hobbiesville', count: 1 },
  { name: 'Black Knight', count: 1 },
  { name: 'Exor Games', count: 1 },
  { name: 'Game Knight', count: 1 },
  { name: 'House of Cards', count: 1 },
];

export const FALLBACK_CARDS = [
  'Lightning Bolt', 'Atraxa, Grand Unifier', 'Sol Ring', 'Cyclonic Rift',
  'Smothering Tithe', 'Doubling Season', 'Esper Sentinel', 'Counterspell',
  'Brainstorm', 'Black Lotus', 'Mox Ruby', 'Mox Sapphire',
  'Force of Will', 'Wrath of God', 'Path to Exile', 'Swords to Plowshares',
  'Demonic Tutor', 'Mana Crypt', 'Time Walk', 'Ancestral Recall',
  'Snapcaster Mage', 'Liliana of the Veil', 'Thoughtseize',
  'Birds of Paradise', 'Llanowar Elves', 'Tarmogoyf',
];
