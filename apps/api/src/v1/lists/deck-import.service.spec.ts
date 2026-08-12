import { UnprocessableEntityException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeckImportService } from './deck-import.service';

describe('DeckImportService', () => {
  let service: DeckImportService;

  beforeEach(() => {
    service = new DeckImportService({ get: vi.fn() } as any);
    vi.restoreAllMocks();
  });

  it('only accepts supported HTTPS deck URLs', async () => {
    await expect(service.preview('http://archidekt.com/decks/1', 'owner')).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(service.preview('https://archidekt.com.evil.test/decks/1', 'owner')).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(service.preview('https://archidekt.com/decks/not-an-id', 'owner')).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('constructs Archidekt API requests from the deck id instead of fetching user URLs', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ name: 'My deck', categories: [{ name: 'Commander', cards: [{ quantity: 1, card: { oracleCard: { name: 'Atraxa, Grand Unifier' }, edition: { editioncode: 'one' } } }] }, { name: 'Sideboard', cards: [{ quantity: 2, card: { oracleCard: { name: 'Negate' } } }] }] })));
    const preview = await service.preview('https://archidekt.com/decks/42/a-name?x=1', 'owner');
    expect(fetchMock).toHaveBeenCalledWith('https://archidekt.com/api/decks/42/', expect.anything());
    expect(preview.sourceUrl).toBe('https://archidekt.com/decks/42');
    expect(preview.sections.map((section) => [section.id, section.selectedByDefault])).toEqual([['commander', true], ['sideboard', false]]);
    expect(preview.sections[0].cards[0]).toMatchObject({ name: 'Atraxa, Grand Unifier', quantity: 1, setCode: 'one' });
  });

  it('never calls the retired anonymous Moxfield API', async () => {
    const config = { get: vi.fn((key) => key.endsWith('Endpoint') ? 'https://approved.example/import' : 'Bearer secret') };
    service = new DeckImportService(config as any);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ name: 'Deck', mainboard: [{ quantity: 1, card: { name: 'Sol Ring' } }] })));
    await service.preview('https://moxfield.com/decks/AbCd_123', 'owner');
    expect(fetchMock).toHaveBeenCalledWith('https://approved.example/import/AbCd_123', expect.anything());
    expect(fetchMock.mock.calls[0][0]).not.toContain('api2.moxfield.com');
  });
});
