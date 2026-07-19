import { describe, expect, it } from 'vitest';
import { freshOfferCutoff } from './offer-freshness';

describe('freshOfferCutoff', () => {
  it('excludes offers older than 26 hours', () => {
    const now = new Date('2026-07-19T12:00:00.000Z');

    expect(freshOfferCutoff(now)).toEqual(new Date('2026-07-18T10:00:00.000Z'));
  });
});
