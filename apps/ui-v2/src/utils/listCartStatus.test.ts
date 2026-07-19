import { describe, expect, it } from 'vitest';
import { Condition } from '@scoutlgs/shared';
import type { CartItem } from '@/components/cart/CartContext';
import { cartOffersByName, normalizeCardName, selectedOfferStatus } from './listCartStatus';

const item = (overrides: Partial<CartItem>): CartItem => ({
  id: 1, addedAt: 1, title: 'Sol Ring [Commander Masters]', store: 'Example Games',
  store_key: 'example', variant_id: '1', price: 2.5, condition: Condition.NM, image: '',
  currency: 'CAD', link: '', set: 'CMM', card_number: '1', ...overrides,
});

describe('list cart status', () => {
  it('matches normalized list names and combines matching offers', () => {
    const offers = cartOffersByName([item({}), item({ id: 2, store: 'Other Store', price: 3 })]);
    expect(normalizeCardName('Sol Ring')).toBe('sol ring');
    expect(selectedOfferStatus(offers.get('sol ring') ?? [])).toEqual({ price: 5.5, store: '2 stores' });
  });

  it('leaves a card uncarted when it has no matching selected offer', () => {
    expect(selectedOfferStatus([])).toBeUndefined();
  });
});
