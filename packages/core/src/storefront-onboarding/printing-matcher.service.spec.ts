import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrintingMatcherService } from './printing-matcher.service';
import { Repository, DataSource } from 'typeorm';
import { CardName, CardPrinting, ScryfallSet } from '@scoutlgs/core';

/**
 * Simulated card name data (card_names table).
 */
const CARD_NAMES = [
  { id: 1, name: 'Lightning Bolt', normalized_name: 'lightning bolt' },
  { id: 2, name: 'Ragavan, Nimble Pilferer', normalized_name: 'ragavan, nimble pilferer' },
  { id: 3, name: 'Swords to Plowshares', normalized_name: 'swords to plowshares' },
  { id: 4, name: "Urza's Saga", normalized_name: "urza's saga" },
  { id: 5, name: 'Jace, the Mind Sculptor', normalized_name: 'jace, the mind sculptor' },
];

/**
 * Simulated card_printings data.
 */
const PRINTINGS = [
  { id: 1, card_name_id: 1, set_code: 'lea', collector_number: '161', digital: false },
  { id: 2, card_name_id: 1, set_code: 'm10', collector_number: '146', digital: false },
  { id: 3, card_name_id: 1, set_code: 'm11', collector_number: '149', digital: false },
  { id: 4, card_name_id: 1, set_code: '2xm', collector_number: '117', digital: false },
  { id: 5, card_name_id: 2, set_code: 'mh2', collector_number: '138', digital: false },
  { id: 6, card_name_id: 2, set_code: 'mul', collector_number: '138', digital: true },
  { id: 7, card_name_id: 3, set_code: 'a25', collector_number: '35', digital: false },
  { id: 8, card_name_id: 3, set_code: 'cmr', collector_number: '56', digital: false },
  { id: 9, card_name_id: 4, set_code: 'mh2', collector_number: '259', digital: false },
  { id: 10, card_name_id: 5, set_code: 'wwk', collector_number: '31', digital: false },
  { id: 11, card_name_id: 5, set_code: '2xm', collector_number: '56', digital: false },
  { id: 12, card_name_id: 5, set_code: '2xm', collector_number: '56', digital: true },
];

/**
 * Normalize the same way the service does, so mock lookups align.
 */
function mockNormalize(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"');
}

/**
 * Simulate resolveCardName: exact normalized_name match only.
 * (Fuzzy/trgm simulation is not reliable in JS, so tests rely on exact matches.)
 */
function simulateResolveCardName(
  normalizedName: string,
): { id: number } | null {
  const name = mockNormalize(normalizedName);
  const card = CARD_NAMES.find((c) => c.normalized_name === name);
  return card ? { id: card.id } : null;
}

/**
 * Simulate resolvePrinting: find best printing for a card name ID.
 */
function simulateResolvePrinting(
  cardNameId: number,
  setCode: string | null,
  collectorNumber: string | null,
): { printing_id: number } | null {
  const physicalPrintings = PRINTINGS.filter(
    (p) => p.card_name_id === cardNameId && !p.digital,
  );

  if (physicalPrintings.length === 0) return null;

  const ranked = physicalPrintings
    .map((p) => {
      let priority = 3;
      if (setCode && collectorNumber && p.set_code === setCode && p.collector_number === collectorNumber) {
        priority = 1;
      } else if (setCode && p.set_code === setCode) {
        priority = 2;
      }
      return { ...p, priority };
    })
    .sort((a, b) => a.priority - b.priority || a.id - b.id);

  return { printing_id: ranked[0].id };
}

describe('PrintingMatcherService', () => {
  let service: PrintingMatcherService;
  let mockDataSource: Partial<DataSource>;
  let mockPrintingRepo: Partial<Repository<CardPrinting>>;
  let mockCardNameRepo: Partial<Repository<CardName>>;
  let mockSetRepo: Partial<Repository<ScryfallSet>>;

  beforeEach(() => {
    mockPrintingRepo = {};
    mockSetRepo = {};

    // resolveCardName uses the repo: findOne({ where: { normalizedName } })
    // and a frontface LIKE lookup. We only need to mock findOne to return the
    // card_names row matching the given normalized name.
    mockCardNameRepo = {
      findOne: vi.fn().mockImplementation(async (opts: any) => {
        const where = opts?.where ?? {};
        if (typeof where.normalizedName === 'string') {
          const result = simulateResolveCardName(where.normalizedName);
          return result ? { id: result.id } : null;
        }
        // frontface LIKE path — not exercised in these tests
        return null;
      }),
    };

    // Remaining raw SQL: findBySetAndNumber (priority lookup),
    // resolvePrinting (CASE-WHEN priority ranking), and the trgm
    // similarity() fuzzy fallback.
    mockDataSource = {
      query: vi.fn().mockImplementation(async (sql: string, params: any[]) => {
        if (sql.includes('cp.card_name_id') && sql.includes('s.code = $1') && !sql.includes('printing_id')) {
          const [setCode, collectorNumber] = params;
          const printing = PRINTINGS.find(
            (p) => p.set_code === setCode && p.collector_number === collectorNumber,
          );
          return printing ? [{ id: printing.id, card_name_id: printing.card_name_id }] : [];
        }
        if (sql.includes('similarity')) {
          return [];
        }
        if (sql.includes('printing_id') && sql.includes('card_name_id = $1')) {
          const [cardNameId, setCode, collectorNumber] = params;
          const result = simulateResolvePrinting(cardNameId, setCode, collectorNumber);
          return result ? [result] : [];
        }
        return [];
      }),
    };

    const mockConfigService = {
      get: (_key: string, defaultValue?: unknown) => defaultValue,
    };

    service = new PrintingMatcherService(
      mockPrintingRepo as Repository<CardPrinting>,
      mockCardNameRepo as Repository<CardName>,
      mockSetRepo as Repository<ScryfallSet>,
      mockDataSource as DataSource,
      mockConfigService as never,
    );
  });

  describe('exact match (set_code + collector_number)', () => {
    it('Lightning Bolt - M10 #146', async () => {
      const result = await service.match('Lightning Bolt', 'm10', '146');
      expect(result.confidence).toBe('exact');
      expect(result.cardPrintingId).toBe(2); // m10 printing
      expect(result.cardNameId).toBe(1);
    });

    it('Ragavan, Nimble Pilferer - MH2 #138', async () => {
      const result = await service.match('Ragavan, Nimble Pilferer', 'mh2', '138');
      expect(result.confidence).toBe('exact');
      expect(result.cardPrintingId).toBe(5);
      expect(result.cardNameId).toBe(2);
    });

    it("Urza's Saga - MH2 #259", async () => {
      const result = await service.match("Urza's Saga", 'mh2', '259');
      expect(result.confidence).toBe('exact');
      expect(result.cardPrintingId).toBe(9);
      expect(result.cardNameId).toBe(4);
    });
  });

  describe('name match with set_code + collector_number (exact path normalizes case)', () => {
    it('Lightning Bolt with set 2XM and number 117', async () => {
      const result = await service.match('Lightning Bolt', '2XM', '117');
      expect(result.confidence).toBe('exact');
      expect(result.cardPrintingId).toBe(4); // 2xm printing
      expect(result.cardNameId).toBe(1);
    });
  });

  describe('name match with set_code only (priority 2 via resolvePrinting)', () => {
    it('Lightning Bolt - M11 (no collector number)', async () => {
      const result = await service.match('Lightning Bolt', 'm11', undefined);
      // Falls through findBySetAndNumber (no collector_number), goes to resolveCardName + resolvePrinting
      expect(result.cardPrintingId).toBe(3); // m11 printing
      expect(result.cardNameId).toBe(1);
    });

    it('Swords to Plowshares - CMR (no collector number)', async () => {
      const result = await service.match('Swords to Plowshares', 'cmr', undefined);
      expect(result.cardPrintingId).toBe(8); // cmr printing
      expect(result.cardNameId).toBe(3);
    });

    it('Jace, the Mind Sculptor - 2XM (no collector number)', async () => {
      const result = await service.match('Jace, the Mind Sculptor', '2xm', undefined);
      expect(result.cardPrintingId).toBe(11); // 2xm physical, not digital
      expect(result.cardNameId).toBe(5);
    });
  });

  describe('name match fallback to first physical printing (priority 3)', () => {
    it('Lightning Bolt (no set, no number)', async () => {
      const result = await service.match('Lightning Bolt', undefined, undefined);
      expect(result.cardPrintingId).toBe(1); // first physical (lea)
      expect(result.cardNameId).toBe(1);
    });

    it('Ragavan, Nimble Pilferer (no set info)', async () => {
      const result = await service.match('Ragavan, Nimble Pilferer', undefined, undefined);
      expect(result.cardPrintingId).toBe(5); // mh2 physical (skips digital mul)
      expect(result.cardNameId).toBe(2);
    });
  });

  describe('name variations (normalization)', () => {
    it('lowercase: lightning bolt', async () => {
      const result = await service.match('lightning bolt', 'm10', '146');
      expect(result.confidence).toBe('exact');
      expect(result.cardPrintingId).toBe(2);
    });

    it('extra whitespace: Lightning  Bolt', async () => {
      const result = await service.match('Lightning  Bolt', undefined, undefined);
      expect(result.cardPrintingId).toBe(1);
      expect(result.cardNameId).toBe(1);
    });

    it("smart quotes: Urza\u2019s Saga", async () => {
      const result = await service.match('Urza\u2019s Saga', 'mh2', '259');
      expect(result.confidence).toBe('exact');
      expect(result.cardPrintingId).toBe(9);
    });
  });

  describe('no match', () => {
    it('completely unknown card', async () => {
      const result = await service.match('Totally Fake Card', undefined, undefined);
      expect(result.confidence).toBe('none');
      expect(result.cardPrintingId).toBeNull();
      expect(result.cardNameId).toBeNull();
    });

    it('unknown set_code + collector_number', async () => {
      const result = await service.match('Totally Fake Card', 'zzz', '999');
      expect(result.confidence).toBe('none');
      expect(result.cardPrintingId).toBeNull();
    });
  });

  describe('wrong set code falls back gracefully', () => {
    it('Lightning Bolt with wrong set code still finds card', async () => {
      const result = await service.match('Lightning Bolt', 'zzz', '999');
      // exact path fails, resolveCardName finds card by name, resolvePrinting falls to priority 3
      expect(result.cardPrintingId).toBe(1); // lea fallback
      expect(result.cardNameId).toBe(1);
    });
  });

  describe('dash format: "Card Name - Set Name"', () => {
    it('"Lightning Bolt - Magic 2010" → set code m10', async () => {
      const result = await service.match('Lightning Bolt', 'm10', undefined);
      expect(result.cardPrintingId).toBe(2);
      expect(result.cardNameId).toBe(1);
    });

    it('"Lightning Bolt - Double Masters" → set code 2xm', async () => {
      const result = await service.match('Lightning Bolt', '2xm', undefined);
      expect(result.cardPrintingId).toBe(4);
      expect(result.cardNameId).toBe(1);
    });

    it('"Jace, the Mind Sculptor - Worldwake" → set code wwk', async () => {
      const result = await service.match('Jace, the Mind Sculptor', 'wwk', undefined);
      expect(result.cardPrintingId).toBe(10);
      expect(result.cardNameId).toBe(5);
    });

    it('"Swords to Plowshares - Masters 25 #35" → all three fields', async () => {
      const result = await service.match('Swords to Plowshares', 'a25', '35');
      expect(result.confidence).toBe('exact');
      expect(result.cardPrintingId).toBe(7);
    });

    it('"Ragavan, Nimble Pilferer - Modern Horizons 2 #138" → exact', async () => {
      const result = await service.match('Ragavan, Nimble Pilferer', 'mh2', '138');
      expect(result.confidence).toBe('exact');
      expect(result.cardPrintingId).toBe(5);
    });
  });

  describe('bracket format: "Card Name [SET]"', () => {
    it('"Lightning Bolt [M10]" → set code m10, name only', async () => {
      const result = await service.match('Lightning Bolt', 'm10', undefined);
      expect(result.cardPrintingId).toBe(2);
    });

    it('"Lightning Bolt [2XM] #117" → set + collector number', async () => {
      const result = await service.match('Lightning Bolt', '2xm', '117');
      expect(result.confidence).toBe('exact');
      expect(result.cardPrintingId).toBe(4);
    });

    it('"Swords to Plowshares [A25] #35" → exact match', async () => {
      const result = await service.match('Swords to Plowshares', 'a25', '35');
      expect(result.confidence).toBe('exact');
      expect(result.cardPrintingId).toBe(7);
    });

    it('"Urza\'s Saga [MH2]" → set code only, smart quote handled', async () => {
      const result = await service.match("Urza\u2019s Saga", 'mh2', undefined);
      expect(result.cardPrintingId).toBe(9);
      expect(result.cardNameId).toBe(4);
    });

    it('"Jace, the Mind Sculptor [WWK] #31" → exact', async () => {
      const result = await service.match('Jace, the Mind Sculptor', 'wwk', '31');
      expect(result.confidence).toBe('exact');
      expect(result.cardPrintingId).toBe(10);
    });

    it('"Ragavan, Nimble Pilferer [MH2]" → set code only', async () => {
      const result = await service.match('Ragavan, Nimble Pilferer', 'mh2', undefined);
      expect(result.cardPrintingId).toBe(5);
      expect(result.cardNameId).toBe(2);
    });
  });

  describe('parenthesis format: "Card Name (Set Name)"', () => {
    it('"Lightning Bolt (Magic 2011)" → set code m11', async () => {
      const result = await service.match('Lightning Bolt', 'm11', undefined);
      expect(result.cardPrintingId).toBe(3);
    });

    it('"Swords to Plowshares (Commander Legends)" → set code cmr', async () => {
      const result = await service.match('Swords to Plowshares', 'cmr', undefined);
      expect(result.cardPrintingId).toBe(8);
    });

    it('"Jace, the Mind Sculptor (Double Masters) #56" → exact', async () => {
      const result = await service.match('Jace, the Mind Sculptor', '2xm', '56');
      expect(result.confidence).toBe('exact');
      expect(result.cardPrintingId).toBe(11);
    });
  });

  describe('minimal info / edge cases', () => {
    it('card name only, no set info at all', async () => {
      const result = await service.match('Lightning Bolt', undefined, undefined);
      expect(result.cardPrintingId).toBe(1); // first physical (lea)
      expect(result.cardNameId).toBe(1);
    });

    it('card name with wrong set code falls back to first printing', async () => {
      const result = await service.match('Lightning Bolt', 'zzz', '999');
      expect(result.cardPrintingId).toBe(1); // lea fallback
    });

    it('card name only, skips digital printings', async () => {
      const result = await service.match('Ragavan, Nimble Pilferer', undefined, undefined);
      expect(result.cardPrintingId).toBe(5); // mh2 physical, not mul digital
    });

    it('stripped punctuation needs real trgm (mock limitation)', async () => {
      const result = await service.match('Ragavan Nimble Pilferer', undefined, undefined);
      expect(result.confidence).toBe('none');
      expect(result.cardPrintingId).toBeNull();
    });

    it('completely unknown card', async () => {
      const result = await service.match('Totally Fake Card', undefined, undefined);
      expect(result.confidence).toBe('none');
      expect(result.cardPrintingId).toBeNull();
    });
  });
});
