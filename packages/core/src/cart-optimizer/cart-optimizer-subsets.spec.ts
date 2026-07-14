import { describe, expect, it } from 'vitest';
import { Condition, type CardWithStore } from '@scoutlgs/shared';
import { optimizeCart } from './cart-optimizer';

const offer = (id: number, store: string, price: number): CardWithStore => ({
  id, store, store_key: store, price, condition: Condition.LP, foil: false,
  image: '', title: `card-${id}`, currency: 'CAD', link: '', set: '', card_number: '',
});

describe('store subset optimizer', () => {
  it('charges shipping once and chooses the lowest complete store subset', () => {
    const result = optimizeCart({
      wantedCards: [{ key: 'a', name: 'A' }, { key: 'b', name: 'B' }],
      candidates: [
        { wantedCardKey: 'a', offer: offer(1, 'one', 1) },
        { wantedCardKey: 'b', offer: offer(2, 'one', 5) },
        { wantedCardKey: 'a', offer: offer(3, 'two', 2) },
        { wantedCardKey: 'b', offer: offer(4, 'two', 2) },
      ],
      options: { defaultShippingCost: 3 },
    });
    expect(result.selectedOffers.map((item) => item.storeKey)).toEqual(['two', 'two']);
    expect(result.totals).toMatchObject({ subtotal: 4, shipping: 3, estimatedTotal: 7 });
    expect(result).toMatchObject({ optimal: true, subsetsEvaluated: 4 });
  });

  it('returns the best result found with optimal false when its clock expires', () => {
    let tick = 0;
    const result = optimizeCart({
      wantedCards: [{ key: 'a', name: 'A' }],
      candidates: [{ wantedCardKey: 'a', offer: offer(1, 'one', 1) }],
      options: { timeBudgetMs: 2, now: () => tick++ },
    });
    expect(result.optimal).toBe(false);
    expect(result.subsetsEvaluated).toBe(1);
  });

  it('ignores finite offer quantity in the initial asynchronous version', () => {
    const shared = offer(1, 'one', 1);
    const result = optimizeCart({
      wantedCards: [{ key: 'a', name: 'A', quantity: 2 }],
      candidates: [{ wantedCardKey: 'a', offer: shared, availableQuantity: 1 }],
    });
    expect(result.status).toBe('complete');
    expect(result.selectedOffers).toHaveLength(2);
  });
});
