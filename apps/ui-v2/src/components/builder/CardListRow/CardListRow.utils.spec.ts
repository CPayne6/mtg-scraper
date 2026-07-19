import { describe, expect, it, vi, afterEach } from 'vitest';
import { ScryfallImageQueue } from './CardListRow.utils';

describe('ScryfallImageQueue', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('spaces image requests to stay below Scryfall’s rate limit', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-19T00:00:00Z'));
    const queue = new ScryfallImageQueue();
    const loaded: string[] = [];

    void queue.enqueue('first').then((url) => loaded.push(url));
    void queue.enqueue('second').then((url) => loaded.push(url));

    await vi.advanceTimersByTimeAsync(0);
    expect(loaded).toEqual(['first']);

    await vi.advanceTimersByTimeAsync(124);
    expect(loaded).toEqual(['first']);

    await vi.advanceTimersByTimeAsync(1);
    expect(loaded).toEqual(['first', 'second']);
  });
});
