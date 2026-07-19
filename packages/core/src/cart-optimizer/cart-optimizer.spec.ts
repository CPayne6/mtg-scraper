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

  it('only downgrades to MP when it saves at least 25 percent', () => {
    const result = optimizeCart({
      wantedCards: [wanted('Fetchland', Condition.NM)],
      candidates: [
        candidate('Fetchland', { price: 12, condition: Condition.NM }),
        candidate('Fetchland', { price: 9, condition: Condition.MP }),
      ],
      options: { conditionFlexibility: { mode: 'allow-if-cheaper' } },
    });

    expect(result.selectedOffers[0]).toMatchObject({
      condition: Condition.MP,
      price: 9,
      conditionDowngradeSteps: 2,
    });
  });

  it('uses an MP-or-better fallback only when no offer meets the requested condition', () => {
    const result = optimizeCart({
      wantedCards: [wanted('Unavailable Near Mint Card', Condition.NM)],
      candidates: [
        candidate('Unavailable Near Mint Card', {
          price: 1.5,
          condition: Condition.MP,
        }),
      ],
      options: { conditionFlexibility: { mode: 'allow-if-cheaper' } },
    });

    expect(result.selectedOffers[0]).toMatchObject({
      condition: Condition.MP,
      price: 1.5,
      meetsMinimumCondition: false,
    });
  });

  it('keeps the requested condition when a downgrade saves less than 25 percent', () => {
    const result = optimizeCart({
      wantedCards: [wanted('Fetchland', Condition.NM)],
      candidates: [
        candidate('Fetchland', { price: 12, condition: Condition.NM }),
        candidate('Fetchland', { price: 9.5, condition: Condition.MP }),
      ],
      options: { conditionFlexibility: { mode: 'allow-if-cheaper' } },
    });

    expect(result.selectedOffers[0]).toMatchObject({
      condition: Condition.NM,
      price: 12,
    });
  });

  it('keeps the requested condition when a 25 percent downgrade saves less than CA$1', () => {
    const result = optimizeCart({
      wantedCards: [wanted('Moderately Priced Card', Condition.NM)],
      candidates: [
        candidate('Moderately Priced Card', { price: 3, condition: Condition.NM }),
        candidate('Moderately Priced Card', { price: 2.25, condition: Condition.MP }),
      ],
      options: { conditionFlexibility: { mode: 'allow-if-cheaper' } },
    });

    expect(result.selectedOffers[0]).toMatchObject({
      condition: Condition.NM,
      price: 3,
    });
  });

  it('does not automatically downgrade cards below CA$2 even when the saving is large', () => {
    const result = optimizeCart({
      wantedCards: [wanted('Cheap Staple', Condition.NM)],
      candidates: [
        candidate('Cheap Staple', { price: 1.99, condition: Condition.NM }),
        candidate('Cheap Staple', { price: 0.5, condition: Condition.MP }),
      ],
      options: { conditionFlexibility: { mode: 'allow-if-cheaper' } },
    });

    expect(result.selectedOffers[0]).toMatchObject({
      condition: Condition.NM,
      price: 1.99,
    });
  });

  it('never automatically downgrades below MP', () => {
    const result = optimizeCart({
      wantedCards: [wanted('Premium Card', Condition.NM)],
      candidates: [
        candidate('Premium Card', { price: 10, condition: Condition.NM }),
        candidate('Premium Card', { price: 1, condition: Condition.HP }),
      ],
      options: { conditionFlexibility: { mode: 'allow-if-cheaper' } },
    });

    expect(result.selectedOffers[0]).toMatchObject({
      condition: Condition.NM,
      price: 10,
    });
  });

  it('can prefer a higher-condition offer when the premium is in the value window', () => {
    const result = optimizeCart({
      wantedCards: [wanted('Expensive Staple', Condition.LP)],
      candidates: [
        candidate('Expensive Staple', {
          price: 80,
          condition: Condition.LP,
        }),
        candidate('Expensive Staple', {
          price: 100,
          condition: Condition.NM,
        }),
      ],
      options: {
        conditionValue: {
          mode: 'prefer-higher-condition',
          minimumHigherConditionPrice: 50,
          minUpgradePremium: 10,
          maxUpgradePremium: 30,
        },
      },
    });

    expect(result.status).toBe('complete');
    expect(result.selectedOffers[0]).toMatchObject({
      condition: Condition.NM,
      conditionValuePenalty: 0,
      price: 100,
    });
  });

  it('does not force a higher-condition offer when the premium is too large', () => {
    const result = optimizeCart({
      wantedCards: [wanted('Expensive Staple', Condition.LP)],
      candidates: [
        candidate('Expensive Staple', {
          price: 60,
          condition: Condition.LP,
        }),
        candidate('Expensive Staple', {
          price: 100,
          condition: Condition.NM,
        }),
      ],
      options: {
        conditionValue: {
          mode: 'prefer-higher-condition',
          minimumHigherConditionPrice: 50,
          minUpgradePremium: 10,
          maxUpgradePremium: 30,
        },
      },
    });

    expect(result.status).toBe('complete');
    expect(result.selectedOffers[0]).toMatchObject({
      condition: Condition.LP,
      conditionValuePenalty: 0,
      price: 60,
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

  it('ignores finite offer quantity', () => {
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

    expect(result.status).toBe('complete');
    expect(result.selectedOffers).toHaveLength(2);
    expect(result.missingCards).toHaveLength(0);
    expect(result.totals.estimatedTotal).toBe(5);
  });

  it('returns only the single best cart option', () => {
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

    expect(results).toHaveLength(1);
    expect(results[0].selectedOffers.map((item) => item.storeKey)).toEqual([
      'store-b',
      'store-b',
    ]);
    expect(results[0].totals.estimatedTotal).toBe(6.25);
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

  it('ignores finite offer quantity across duplicate wanted card entries', () => {
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

    expect(result.status).toBe('complete');
    expect(result.selectedOffers).toHaveLength(2);
    expect(result.missingCards).toHaveLength(0);
  });

  it('coerces numeric wanted-card keys before matching candidates', () => {
    const result = optimizeCart({
      wantedCards: [{ key: 7 as unknown as string, name: 'A' }],
      candidates: [{ wantedCardKey: '7', offer: candidate('7').offer }],
    });

    expect(result.status).toBe('complete');
    expect(result.selectedOffers).toHaveLength(1);
  });
});
