import { describe, expect, it, vi } from 'vitest';
import { ScryfallCatalogService } from './scryfall-catalog.service';

const msh = {
  code: 'msh', name: 'Marvel Super Heroes', released_at: '2026-06-26',
  digital: false, set_type: 'expansion',
};
const moleMan = {
  id: 'f1d4c9f6-6df3-45dd-82f7-2a87959d91b0',
  oracle_id: '34994475-b914-44f6-8ca1-c2747b6d5956',
  name: 'Mole Man, Moloid Master', set: 'msh', set_name: 'Marvel Super Heroes',
  collector_number: '177', rarity: 'rare', layout: 'normal',
};

describe('ScryfallCatalogService', () => {
  it('refreshes a tracked set referenced by missing-printing evidence', async () => {
    const manager = { query: vi.fn()
      .mockResolvedValueOnce([{ id: 7 }])
      .mockResolvedValueOnce([{ id: 8 }])
      .mockResolvedValueOnce([]) };
    const dataSource = {
      query: vi.fn()
        .mockResolvedValueOnce([{ code: 'msh' }])
        .mockResolvedValueOnce([{ set_code: 'msh' }])
        .mockResolvedValueOnce([{ id: 4 }]),
      transaction: vi.fn(async (callback) => callback(manager)),
    };
    const queueService = { enqueueReextractUnmatchedJob: vi.fn().mockResolvedValue(undefined) };
    const cacheService = { publishCardDataChanged: vi.fn().mockResolvedValue(undefined) };
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [msh] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [moleMan], has_more: false }))));

    const service = new ScryfallCatalogService(dataSource as any, queueService as any, cacheService as any);
    await expect(service.syncMissingSets()).resolves.toEqual(['msh']);

    expect(manager.query).toHaveBeenCalledTimes(3);
    expect(cacheService.publishCardDataChanged).toHaveBeenCalledWith('sets:msh');
    expect(queueService.enqueueReextractUnmatchedJob).toHaveBeenCalledWith({
      storeId: 4, setCodes: ['msh'], delayMs: 10_000,
    });
  });

  it('queues a bounded bootstrap repair when no catalog import is needed', async () => {
    const dataSource = {
      query: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 5 }]),
      transaction: vi.fn(),
    };
    const queueService = { enqueueReextractUnmatchedJob: vi.fn().mockResolvedValue(undefined) };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }))));

    const service = new ScryfallCatalogService(dataSource as any, queueService as any, { publishCardDataChanged: vi.fn() } as any);
    await expect(service.syncMissingSets()).resolves.toEqual([]);

    expect(queueService.enqueueReextractUnmatchedJob).toHaveBeenCalledWith({
      storeId: 5, repairMissingPrintings: true, delayMs: 10_000,
    });
  });
});
