import { describe, it, expect } from 'vitest';
import { ShopifyExtractionAdapter } from './shopify-extraction.adapter';
import { F2fCardDetailExtractor } from './extractors/f2f-card-detail.extractor';
import { BinderposCardDetailExtractor } from './extractors/binderpos-card-detail.extractor';
import { DefaultCardDetailExtractor } from './extractors/default-card-detail.extractor';
import { Condition } from '@scoutlgs/shared';

// Create a minimal adapter for testing shared methods
const defaultExtractor = new DefaultCardDetailExtractor();
const extractors = {
  f2f: new F2fCardDetailExtractor(),
  binderpos: new BinderposCardDetailExtractor(),
};
const mockProxyService = {
  getRotatingProxyAgent: async () => undefined,
} as any;

const adapter = new ShopifyExtractionAdapter(extractors, defaultExtractor, mockProxyService);

describe('ShopifyExtractionAdapter', () => {
  describe('parseConditionAndFoil', () => {
    it('F2F variant "NM" → NM, non-foil', () => {
      const result = adapter.parseConditionAndFoil({ id: 1, title: 'NM', price: 100, available: true, option1: 'NM' });
      expect(result.condition).toBe(Condition.NM);
      expect(result.foil).toBe(false);
    });

    it('F2F variant "PL" → LP, non-foil', () => {
      const result = adapter.parseConditionAndFoil({ id: 1, title: 'PL', price: 100, available: true, option1: 'PL' });
      expect(result.condition).toBe(Condition.LP);
      expect(result.foil).toBe(false);
    });

    it('binderpos "Near Mint" → NM, non-foil', () => {
      const result = adapter.parseConditionAndFoil({ id: 1, title: 'Near Mint', price: 100, available: true, option1: 'Near Mint' });
      expect(result.condition).toBe(Condition.NM);
      expect(result.foil).toBe(false);
    });

    it('binderpos "Lightly Played Foil" → LP, foil', () => {
      const result = adapter.parseConditionAndFoil({ id: 1, title: 'Lightly Played Foil', price: 100, available: true, option1: 'Lightly Played Foil' });
      expect(result.condition).toBe(Condition.LP);
      expect(result.foil).toBe(true);
    });

    it('binderpos "Near Mint Foil" → NM, foil', () => {
      const result = adapter.parseConditionAndFoil({ id: 1, title: 'Near Mint Foil', price: 100, available: true, option1: 'Near Mint Foil' });
      expect(result.condition).toBe(Condition.NM);
      expect(result.foil).toBe(true);
    });

    it('binderpos "Moderately Played" → MP, non-foil', () => {
      const result = adapter.parseConditionAndFoil({ id: 1, title: 'Moderately Played', price: 100, available: true, option1: 'Moderately Played' });
      expect(result.condition).toBe(Condition.MP);
      expect(result.foil).toBe(false);
    });

    it('binderpos "Heavily Played Foil" → HP, foil', () => {
      const result = adapter.parseConditionAndFoil({ id: 1, title: 'Heavily Played Foil', price: 100, available: true, option1: 'Heavily Played Foil' });
      expect(result.condition).toBe(Condition.HP);
      expect(result.foil).toBe(true);
    });

    it('binderpos "Damaged" → DMG, non-foil', () => {
      const result = adapter.parseConditionAndFoil({ id: 1, title: 'Damaged', price: 100, available: true, option1: 'Damaged' });
      expect(result.condition).toBe(Condition.DMG);
      expect(result.foil).toBe(false);
    });
  });

  describe('extractor selection', () => {
    it('selects F2F extractor for f2f scraper type', () => {
      // The adapter internally maps scraperType to extractors
      // We verify this by checking the extractorMap via the constructor
      expect((adapter as any).extractorMap['f2f']).toBeInstanceOf(F2fCardDetailExtractor);
    });

    it('selects Binderpos extractor for binderpos scraper type', () => {
      expect((adapter as any).extractorMap['binderpos']).toBeInstanceOf(BinderposCardDetailExtractor);
    });

    it('falls back to default extractor for unknown scraper type', () => {
      expect((adapter as any).extractorMap['401']).toBeUndefined();
      expect((adapter as any).extractorMap['hobbies']).toBeUndefined();
      expect((adapter as any).defaultExtractor).toBeInstanceOf(DefaultCardDetailExtractor);
    });
  });
});
