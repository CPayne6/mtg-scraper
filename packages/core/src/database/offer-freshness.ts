/**
 * Daily full extraction can run past midnight, so allow a small grace period
 * beyond one day before treating an offer as stale.
 */
const FRESH_OFFER_MAX_AGE_MS = 26 * 60 * 60 * 1000;

export function freshOfferCutoff(now = new Date()): Date {
  return new Date(now.getTime() - FRESH_OFFER_MAX_AGE_MS);
}
