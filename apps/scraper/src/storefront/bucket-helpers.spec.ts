import { describe, it, expect } from 'vitest';
import {
  generateYearlyBuckets,
  halveDateRange,
} from './storefront.processor';

describe('generateYearlyBuckets', () => {
  it('produces one bucket per year aligned to Jan 1 UTC boundaries', () => {
    const buckets = generateYearlyBuckets(
      '2023-03-15T00:00:00.000Z',
      '2026-05-08T00:00:00.000Z',
    );

    expect(buckets).toHaveLength(4);
    expect(buckets[0].start).toBe('2023-03-15T00:00:00.000Z');
    expect(buckets[0].end).toBe('2024-01-01T00:00:00.000Z');
    expect(buckets[1].start).toBe('2024-01-01T00:00:00.000Z');
    expect(buckets[1].end).toBe('2025-01-01T00:00:00.000Z');
    expect(buckets[2].start).toBe('2025-01-01T00:00:00.000Z');
    expect(buckets[2].end).toBe('2026-01-01T00:00:00.000Z');
    expect(buckets[3].start).toBe('2026-01-01T00:00:00.000Z');
  });

  it('extends the last bucket past the actual max so the newest product is included', () => {
    const maxCreatedAt = '2026-05-08T21:52:47.000Z';
    const buckets = generateYearlyBuckets('2026-01-02T00:00:00.000Z', maxCreatedAt);

    expect(buckets).toHaveLength(1);
    expect(new Date(buckets[0].end).getTime()).toBeGreaterThan(
      new Date(maxCreatedAt).getTime(),
    );
  });

  it('returns one bucket when min and max are in the same year', () => {
    const buckets = generateYearlyBuckets(
      '2025-06-01T00:00:00.000Z',
      '2025-09-30T00:00:00.000Z',
    );
    expect(buckets).toHaveLength(1);
    expect(buckets[0].start).toBe('2025-06-01T00:00:00.000Z');
  });

  it('returns empty when min > max', () => {
    const buckets = generateYearlyBuckets(
      '2026-01-01T00:00:00.000Z',
      '2025-01-01T00:00:00.000Z',
    );
    expect(buckets).toEqual([]);
  });

  it('handles a single instant (min === max)', () => {
    const ts = '2025-06-15T12:00:00.000Z';
    const buckets = generateYearlyBuckets(ts, ts);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].start).toBe(ts);
    expect(new Date(buckets[0].end).getTime()).toBeGreaterThan(
      new Date(ts).getTime(),
    );
  });
});

describe('halveDateRange', () => {
  it('splits at the midpoint and shares the boundary across the two halves', () => {
    const [left, right] = halveDateRange(
      '2024-01-01T00:00:00.000Z',
      '2024-07-01T00:00:00.000Z',
    );

    expect(left.start).toBe('2024-01-01T00:00:00.000Z');
    expect(right.end).toBe('2024-07-01T00:00:00.000Z');
    expect(left.end).toBe(right.start);
    expect(new Date(left.end).getUTCMonth()).toBe(3); // April-ish midpoint
  });

  it('halves a single-day range to a millisecond-grain midpoint', () => {
    const [left, right] = halveDateRange(
      '2025-06-15T00:00:00.000Z',
      '2025-06-16T00:00:00.000Z',
    );

    expect(left.end).toBe(right.start);
    expect(new Date(left.end).getUTCHours()).toBe(12);
  });

  it('produces deterministic output for the same input', () => {
    const a = halveDateRange('2024-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    const b = halveDateRange('2024-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    expect(a).toEqual(b);
  });
});
