import { CardWithStore, CardSearchResponse, Condition } from '@scoutlgs/shared';

export const mockCardWithStore: CardWithStore = {
  title: 'Black Lotus',
  set: 'Limited Edition Alpha',
  price: 150000,
  condition: Condition.NM,
  currency: 'CAD',
  link: 'https://example.com/product/black-lotus',
  image: 'https://example.com/black-lotus.jpg',
  card_number: '1',
  scryfall_id: 'abc123',
  store: 'Test Store',
  store_key: 'teststore',
};

export const mockCardSearchResponse: CardSearchResponse = {
  cardName: 'Black Lotus',
  stores: [
    {
      id: 1,
      uuid: '550e8400-e29b-41d4-a716-446655440000',
      name: 'teststore',
      displayName: 'Test Store',
      logoUrl: 'https://example.com/test-logo.png',
      cardCount: 1,
    },
  ],
  priceStats: {
    min: 150000,
    max: 150000,
    avg: 150000,
    count: 1,
  },
  results: [mockCardWithStore],
  timestamp: Date.now(),
};

export const mockMultipleCards: CardWithStore[] = [
  {
    ...mockCardWithStore,
    price: 100,
    store: 'Store A',
    store_key: 'store-a',
  },
  {
    ...mockCardWithStore,
    price: 200,
    store: 'Store B',
    store_key: 'store-b',
  },
  {
    ...mockCardWithStore,
    price: 150,
    store: 'Store C',
    store_key: 'store-c',
  },
];

export const createMockCard = (overrides: Partial<CardWithStore> = {}): CardWithStore => ({
  ...mockCardWithStore,
  ...overrides,
});

export const createMockCards = (count: number): CardWithStore[] => {
  return Array.from({ length: count }, (_, i) =>
    createMockCard({
      title: `Card ${i + 1}`,
      price: (i + 1) * 100,
      store: `Store ${i + 1}`,
      store_key: `store-${i + 1}`,
    }),
  );
};
