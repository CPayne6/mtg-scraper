import { describe, it, expect } from 'vitest';
import { DefaultCardDetailExtractor } from './default-card-detail.extractor';

const extractor = new DefaultCardDetailExtractor();

describe('DefaultCardDetailExtractor', () => {
  describe('parseTitle', () => {
    it('parenthesis format: "Card (Set)"', () => {
      const result = extractor.parseTitle('Lightning Bolt (Magic 2010)');
      expect(result.cardName).toBe('Lightning Bolt');
      expect(result.setName).toBe('Magic 2010');
    });

    it('dash format: "Card - Set"', () => {
      const result = extractor.parseTitle('Lightning Bolt - Magic 2010');
      expect(result.cardName).toBe('Lightning Bolt');
      expect(result.setName).toBe('Magic 2010');
    });

    it('single bracket format: "Card [Set]"', () => {
      const result = extractor.parseTitle('Lightning Bolt [Magic 2011]');
      expect(result.cardName).toBe('Lightning Bolt');
      expect(result.setName).toBe('Magic 2011');
    });

    it('bracket with parenthesized collector number', () => {
      const result = extractor.parseTitle('Lightning Bolt (1638) [Secret Lair Drop Series]');
      expect(result.cardName).toBe('Lightning Bolt');
      expect(result.setName).toBe('Secret Lair Drop Series');
      expect(result.collectorNumber).toBe('1638');
    });

    it('multi-bracket picks second bracket as set name', () => {
      const result = extractor.parseTitle('Card [80] [Some Set]');
      expect(result.cardName).toBe('Card');
      expect(result.setName).toBe('Some Set');
    });

    it('plain text fallback', () => {
      const result = extractor.parseTitle('Lightning Bolt');
      expect(result.cardName).toBe('Lightning Bolt');
      expect(result.setName).toBe('');
    });
  });

  describe('parseSkuInfo', () => {
    it('generic SET-NUM format', () => {
      const result = extractor.parseSkuInfo('M11-149-EN-NF-1');
      expect(result.setCode).toBe('m11');
      expect(result.collectorNumber).toBe('149');
    });

    it('with foil indicator FO', () => {
      const result = extractor.parseSkuInfo('A25-141-EN-FO-3');
      expect(result.foil).toBe(true);
    });

    it('with non-foil indicator NF', () => {
      const result = extractor.parseSkuInfo('M11-149-EN-NF-1');
      expect(result.foil).toBe(false);
    });

    it('no foil indicator returns undefined foil', () => {
      const result = extractor.parseSkuInfo('M11-149');
      expect(result.setCode).toBe('m11');
      expect(result.collectorNumber).toBe('149');
      expect(result.foil).toBeUndefined();
    });

    it('undefined returns empty', () => {
      expect(extractor.parseSkuInfo(undefined)).toEqual({});
    });

    it('empty string returns empty', () => {
      expect(extractor.parseSkuInfo('')).toEqual({});
    });

    it('non-matching SKU returns empty', () => {
      expect(extractor.parseSkuInfo('WYR24203')).toEqual({});
    });
  });

  describe('parseTags', () => {
    it('detects foil from tags', () => {
      const result = extractor.parseTags(['Foil', 'Normal', 'Red']);
      expect(result.foil).toBe(true);
    });

    it('detects non-foil from tags', () => {
      const result = extractor.parseTags(['Normal', 'Red']);
      expect(result.foil).toBe(false);
    });

    it('does not extract set name (generic fallback)', () => {
      const result = extractor.parseTags(['Magic 2011', 'Foil', 'Red']);
      expect(result.setName).toBeUndefined();
    });

    it('empty tags return empty', () => {
      expect(extractor.parseTags('')).toEqual({});
      expect(extractor.parseTags([])).toEqual({});
      expect(extractor.parseTags(undefined)).toEqual({});
    });
  });

  describe('parseImageFilename', () => {
    it('returns empty (no structured pattern for generic stores)', () => {
      expect(extractor.parseImageFilename('https://example.com/image.jpg')).toEqual({});
      expect(extractor.parseImageFilename(undefined)).toEqual({});
    });
  });
});
