/**
 * Daily full extraction can run past midnight, so leave a small grace period
 * beyond one day before treating an offer as stale.
 */
export const FRESH_OFFER_MAX_AGE_MS = 36 * 60 * 60 * 1000;

export function freshOfferCutoff(now = new Date()): Date {
  return new Date(now.getTime() - FRESH_OFFER_MAX_AGE_MS);
}
