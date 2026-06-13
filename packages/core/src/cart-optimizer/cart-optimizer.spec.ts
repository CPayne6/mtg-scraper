import { Condition, type CardWithStore } from '@scoutlgs/shared';
import { describe, expect, it } from 'vitest';
import { optimizeCart, optimizeCartOptions } from './cart-optimizer';
import type {
  CartOptimizationCandidate,
  CartOptimizationWantedCard,
} from './cart-optimizer.types';

function wanted(
  key: string,
  minimumCondition: Condition = Condition.NM,
): CartOptimizationWantedCard {
  return {
    key,
    name: key,
    minimumCondition,
  };
}

function candidate(
  wantedCardKey: string,
  overrides: Partial<CardWithStore> = {},
): CartOptimizationCandidate {
  const storeKey = overrides.store_key ?? 'store-a';
  const card: CardWithStore = {
    id: Number(`${wantedCardKey.length}${Math.round((overrides.price ?? 1) * 100)}`),
    title: wantedCardKey,
    set: 'Test Set',
    price: 1,
    condition: Condition.NM,
    currency: 'CAD',
    link: `https://example.com/${storeKey}/${wantedCardKey}`,
    image: '',
    card_number: '',
    store: storeKey === 'store-a' ? 'Store A' : 'Store B',
    store_key: storeKey,
    ...overrides,
  };

  return {
    wantedCardKey,
    offer: card,
  };
}

describe('optimizeCart', () => {
  it('minimizes card prices plus one shipping charge per used store', () => {
    const result = optimizeCart({
      wantedCards: [wanted('Sol Ring'), wanted('Counterspell')],
      candidates: [
        candidate('Sol Ring', { price: 2, store: 'Store A', store_key: 'store-a' }),
        candidate('Counterspell', { price: 3.5, store: 'Store A', store_key: 'store-a' }),
        candidate('Counterspell', { price: 1, store: 'Store B', store_key: 'store-b' }),
      ],
    });

    expect(result.status).toBe('complete');
    expect(result.selectedOffers).toHaveLength(2);
    expect(result.selectedOffers.map((item) => item.storeKey)).toEqual([
      'store-a',
      'store-a',
    ]);
    expect(result.stores).toHaveLength(1);
    expect(result.totals).toMatchObject({
      subtotal: 5.5,
      shipping: 3,
      estimatedTotal: 8.5,
      objectiveTotal: 8.5,
    });
  });

  it('reports below-minimum-only cards in strict mode', () => {
    const result = optimizeCart({
      wantedCards: [wanted('Rhystic Study', Condition.LP)],
      candidates: [
        candidate('Rhystic Study', {
          price: 2,
          condition: Condition.MP,
        }),
      ],
    });

    expect(result.status).toBe('empty');
    expect(result.selectedOffers).toHaveLength(0);
    expect(result.missingCards).toHaveLength(1);
    expect(result.missingCards[0]).toMatchObject({
      wantedCardKey: 'Rhystic Study',
      reason: 'below-minimum-only',
      minimumCondition: Condition.LP,
    });
    expect(result.missingCards[0].bestRejectedOffer?.condition).toBe(Condition.MP);
  });

  it('allows a lower-condition offer when flexibility is needed', () => {
    const result = optimizeCart({
      wantedCards: [wanted('Dockside Extortionist', Condition.LP)],
      candidates: [
        candidate('Dockside Extortionist', {
          price: 2,
          condition: Condition.MP,
        }),
      ],
      options: {
        conditionFlexibility: {
          mode: 'allow-if-needed',
          downgradePenaltyPerStep: 5,
        },
      },
    });

    expect(result.status).toBe('complete');
    expect(result.selectedOffers[0]).toMatchObject({
      condition: Condition.MP,
      meetsMinimumCondition: false,
      conditionDowngradeSteps: 1,
      conditionPenalty: 5,
    });
    expect(result.totals).toMatchObject({
      subtotal: 2,
      shipping: 3,
      estimatedTotal: 5,
      conditionPenalty: 5,
      objectiveTotal: 10,
    });
  });

  it('can choose a lower-condition offer when the price discrepancy beats the penalty', () => {
    const result = optimizeCart({
      wantedCards: [wanted('Mana Crypt', Condition.NM)],
      candidates: [
        candidate('Mana Crypt', {
          price: 20,
          condition: Condition.NM,
          store: 'Store A',
          store_key: 'store-a',
        }),
        candidate('Mana Crypt', {
          price: 2,
          condition: Condition.MP,
          store: 'Store B',
          store_key: 'store-b',
        }),
      ],
      options: {
        conditionFlexibility: {
          mode: 'allow-if-cheaper',
          downgradePenaltyPerStep: 5,
        },
      },
    });

    expect(result.status).toBe('complete');
    expect(result.selectedOffers).toHaveLength(1);
    expect(result.selectedOffers[0]).toMatchObject({
      storeKey: 'store-b',
      condition: Condition.MP,
      conditionDowngradeSteps: 2,
      conditionPenalty: 10,
    });
    expect(result.totals).toMatchObject({
      subtotal: 2,
      shipping: 3,
      estimatedTotal: 5,
      conditionPenalty: 10,
      objectiveTotal: 15,
    });
  });

  it('returns a partial result when some wanted cards have no candidates', () => {
    const result = optimizeCart({
      wantedCards: [wanted('Sol Ring'), wanted('Demonic Tutor')],
      candidates: [
        candidate('Sol Ring', {
          price: 2,
        }),
      ],
    });

    expect(result.status).toBe('partial');
    expect(result.selectedOffers.map((item) => item.wantedCardKey)).toEqual(['Sol Ring']);
    expect(result.missingCards).toHaveLength(1);
    expect(result.missingCards[0]).toMatchObject({
      wantedCardKey: 'Demonic Tutor',
      reason: 'no-candidates',
    });
    expect(result.totals.estimatedTotal).toBe(5);
  });

  it('returns a partial result when finite offer quantity is exhausted', () => {
    const limitedCandidate = candidate('Island', {
      price: 1,
    });
    limitedCandidate.availableQuantity = 1;

    const result = optimizeCart({
      wantedCards: [
        {
          ...wanted('Island'),
          quantity: 2,
        },
      ],
      candidates: [limitedCandidate],
    });

    expect(result.status).toBe('partial');
    expect(result.selectedOffers).toHaveLength(1);
    expect(result.missingCards).toHaveLength(1);
    expect(result.missingCards[0]).toMatchObject({
      wantedCardKey: 'Island:2',
      reason: 'capacity-exhausted',
    });
    expect(result.totals.estimatedTotal).toBe(4);
  });

  it('can return multiple ranked cart options', () => {
    const results = optimizeCartOptions({
      wantedCards: [wanted('Sol Ring'), wanted('Counterspell')],
      candidates: [
        candidate('Sol Ring', { price: 2, store: 'Store A', store_key: 'store-a' }),
        candidate('Sol Ring', { price: 2.25, store: 'Store B', store_key: 'store-b' }),
        candidate('Counterspell', { price: 3.5, store: 'Store A', store_key: 'store-a' }),
        candidate('Counterspell', { price: 1, store: 'Store B', store_key: 'store-b' }),
      ],
      options: {
        maxResults: 2,
      },
    });

    expect(results).toHaveLength(2);
    expect(results[0].selectedOffers.map((item) => item.storeKey)).toEqual([
      'store-b',
      'store-b',
    ]);
    expect(results[0].totals.estimatedTotal).toBe(6.25);
    expect(results[1].selectedOffers.map((item) => item.storeKey)).toEqual([
      'store-a',
      'store-a',
    ]);
    expect(results[1].totals.estimatedTotal).toBe(8.5);
  });

  it('supports a required set preference for a wanted card', () => {
    const result = optimizeCart({
      wantedCards: [
        {
          ...wanted('Lightning Bolt', Condition.LP),
          preferredSetCode: 'lea',
          setPreference: 'required',
        },
      ],
      candidates: [
        candidate('Lightning Bolt', {
          price: 1,
          condition: Condition.NM,
          set: 'Magic 2010',
        }),
        {
          ...candidate('Lightning Bolt', {
            price: 3,
            condition: Condition.LP,
            set: 'Limited Edition Alpha',
          }),
          setCode: 'lea',
          setName: 'Limited Edition Alpha',
        },
      ],
    });

    expect(result.status).toBe('complete');
    expect(result.selectedOffers[0]).toMatchObject({
      price: 3,
      setCode: 'lea',
      setName: 'Limited Edition Alpha',
      preferredSetCode: 'lea',
      meetsSetPreference: true,
    });
  });

  it('shares finite offer quantity across duplicate wanted card entries', () => {
    const first = candidate('Island 1', {
      id: 99,
      price: 1,
      title: 'Island',
      link: 'https://example.com/store-a/island',
    });
    first.availableQuantity = 1;

    const second = {
      ...first,
      wantedCardKey: 'Island 2',
    };

    const result = optimizeCart({
      wantedCards: [
        { ...wanted('Island 1'), name: 'Island' },
        { ...wanted('Island 2'), name: 'Island' },
      ],
      candidates: [first, second],
    });

    expect(result.status).toBe('partial');
    expect(result.selectedOffers).toHaveLength(1);
    expect(result.missingCards).toHaveLength(1);
    expect(result.missingCards[0].reason).toBe('capacity-exhausted');
  });
});
