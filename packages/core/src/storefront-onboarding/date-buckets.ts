/**
 * Split an inclusive ISO timestamp range into UTC calendar-year buckets.
 *
 * The upper bound is exclusive for Storefront `created_at` filters, so the
 * final bucket ends one second after the observed maximum timestamp.
 */
export function generateYearlyBuckets(
  minCreatedAt: string,
  maxCreatedAt: string,
): { start: string; end: string }[] {
  const min = new Date(minCreatedAt);
  const max = new Date(maxCreatedAt);
  if (Number.isNaN(min.getTime()) || Number.isNaN(max.getTime()) || min > max)
    return [];

  const buckets: { start: string; end: string }[] = [];
  let cursor = min;
  while (cursor <= max) {
    const nextYear = new Date(Date.UTC(cursor.getUTCFullYear() + 1, 0, 1));
    const end = nextYear > max ? new Date(max.getTime() + 1000) : nextYear;
    buckets.push({ start: cursor.toISOString(), end: end.toISOString() });
    cursor = nextYear;
  }
  return buckets;
}
