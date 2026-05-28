export const MTG_COLOR_LABELS: Record<string, string> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
  C: 'Colorless',
};

const COLOR_IDENTITY_NAMES: Record<string, string> = {
  '': 'Colorless',
  W: 'Mono White',
  U: 'Mono Blue',
  B: 'Mono Black',
  R: 'Mono Red',
  G: 'Mono Green',
  WU: 'Azorius',
  UB: 'Dimir',
  BR: 'Rakdos',
  RG: 'Gruul',
  WG: 'Selesnya',
  WB: 'Orzhov',
  UR: 'Izzet',
  BG: 'Golgari',
  WR: 'Boros',
  UG: 'Simic',
  WUB: 'Esper',
  UBR: 'Grixis',
  BRG: 'Jund',
  WRG: 'Naya',
  WUG: 'Bant',
  WBR: 'Mardu',
  URG: 'Temur',
  WBG: 'Abzan',
  WUR: 'Jeskai',
  UBG: 'Sultai',
  WUBR: 'Yore-Tiller',
  WUBG: 'Witch-Maw',
  WURG: 'Ink-Treader',
  WBRG: 'Dune-Brood',
  UBRG: 'Glint-Eye',
  WUBRG: '5-color',
};

export function sortColors(colors: string): string {
  return 'WUBRG'.split('').filter((c) => colors.includes(c)).join('');
}

export function colorIdentityName(colors: string): string {
  const sorted = sortColors(colors);
  return COLOR_IDENTITY_NAMES[sorted] ?? sorted;
}

export function scryfallPipSrc(code: string): string {
  return `https://svgs.scryfall.io/card-symbols/${code}.svg`;
}
