import { describe, expect, it, vi } from 'vitest';
import { MoxfieldImportProcessor } from './moxfield-import.processor';

describe('MoxfieldImportProcessor', () => {
  it('returns the browser result and does not expose the deck in logs', async () => {
    const deck = { name: 'Example', boards: {} };
    const browser = { fetchDeck: vi.fn().mockResolvedValue(deck) };
    const processor = new MoxfieldImportProcessor(browser as any);
    const log = vi.spyOn((processor as any).logger, 'log');
    const result = await processor.process({ id: '7', data: { deckId: 'HfV0DVgT2kGL59FjeRx0Nw', enqueuedAt: Date.now() }, processedOn: Date.now() } as any);
    expect(browser.fetchDeck).toHaveBeenCalledWith('HfV0DVgT2kGL59FjeRx0Nw');
    expect(result).toEqual({ provider: 'moxfield', deck });
    expect(log).toHaveBeenCalledWith(expect.not.stringContaining('Example'));
  });
});
