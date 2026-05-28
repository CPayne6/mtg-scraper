import { describe, it, expect } from 'vitest';
import { BinderposCardDetailExtractor } from './binderpos-card-detail.extractor';

const extractor = new BinderposCardDetailExtractor();

describe('BinderposCardDetailExtractor', () => {
  describe('parseTitle', () => {
    describe('1-bracket format: "Card [Set]"', () => {
      it('"Lightning Bolt [Magic 2011]"', () => {
        const result = extractor.parseTitle('Lightning Bolt [Magic 2011]');
        expect(result.cardName).toBe('Lightning Bolt');
        expect(result.setName).toBe('Magic 2011');
      });

      it('"Lightning Bolt [Beatdown]"', () => {
        const result = extractor.parseTitle('Lightning Bolt [Beatdown]');
        expect(result.cardName).toBe('Lightning Bolt');
        expect(result.setName).toBe('Beatdown');
      });

      it('showcase title with dash and parens: "Thrum of the Vestige - Lightning Bolt (Showcase) [FINAL FANTASY : Through the Ages]"', () => {
        const result = extractor.parseTitle(
          'Thrum of the Vestige - Lightning Bolt (Showcase) [FINAL FANTASY : Through the Ages]',
        );
        expect(result.cardName).toBe('Thrum of the Vestige - Lightning Bolt');
        expect(result.setName).toBe('FINAL FANTASY : Through the Ages');
      });
    });

    describe('parenthesized collector number + bracket', () => {
      it('"Lightning Bolt (1638) [Secret Lair Drop Series]"', () => {
        const result = extractor.parseTitle('Lightning Bolt (1638) [Secret Lair Drop Series]');
        expect(result.cardName).toBe('Lightning Bolt');
        expect(result.setName).toBe('Secret Lair Drop Series');
        expect(result.collectorNumber).toBe('1638');
      });

      it('"Ragavan, Nimble Pilferer (138) [Modern Horizons 2]"', () => {
        const result = extractor.parseTitle('Ragavan, Nimble Pilferer (138) [Modern Horizons 2]');
        expect(result.cardName).toBe('Ragavan, Nimble Pilferer');
        expect(result.setName).toBe('Modern Horizons 2');
        expect(result.collectorNumber).toBe('138');
      });
    });

    describe('art treatment stripping', () => {
      it('"Sol Ring (Borderless) [Fallout]" strips (Borderless)', () => {
        const result = extractor.parseTitle('Sol Ring (Borderless) [Fallout]');
        expect(result.cardName).toBe('Sol Ring');
        expect(result.setName).toBe('Fallout');
        expect(result.collectorNumber).toBeUndefined();
      });

      it('"Brainstorm (Extended Art) [Foundations]" strips (Extended Art)', () => {
        const result = extractor.parseTitle('Brainstorm (Extended Art) [Foundations]');
        expect(result.cardName).toBe('Brainstorm');
        expect(result.setName).toBe('Foundations');
      });

      it('"Ragavan, Nimble Pilferer (Retro Frame) [Modern Horizons 2]" strips (Retro Frame)', () => {
        const result = extractor.parseTitle('Ragavan, Nimble Pilferer (Retro Frame) [Modern Horizons 2]');
        expect(result.cardName).toBe('Ragavan, Nimble Pilferer');
        expect(result.setName).toBe('Modern Horizons 2');
      });

      it('preserves (Showcase) in complex multi-part names with dash', () => {
        // "Thrum of the Vestige - Lightning Bolt (Showcase)" is the full card name
        const result = extractor.parseTitle(
          'Thrum of the Vestige - Lightning Bolt (Showcase) [FINAL FANTASY : Through the Ages]',
        );
        expect(result.cardName).toBe('Thrum of the Vestige - Lightning Bolt');
        expect(result.setName).toBe('FINAL FANTASY : Through the Ages');
      });
    });

    describe('fallback (no brackets)', () => {
      it('"Lightning Bolt"', () => {
        const result = extractor.parseTitle('Lightning Bolt');
        expect(result.cardName).toBe('Lightning Bolt');
        expect(result.setName).toBe('');
      });
    });
  });

  describe('parseSkuInfo', () => {
    describe('binderpos format: {SET}-{NUM}-{LANG}-{FOIL}-{COND}', () => {
      it('"M11-149-EN-NF-1" → M11 #149 non-foil', () => {
        const result = extractor.parseSkuInfo('M11-149-EN-NF-1');
        expect(result.setCode).toBe('m11');
        expect(result.collectorNumber).toBe('149');
        expect(result.foil).toBe(false);
      });

      it('"M11-149-EN-FO-1" → M11 #149 foil', () => {
        const result = extractor.parseSkuInfo('M11-149-EN-FO-1');
        expect(result.setCode).toBe('m11');
        expect(result.collectorNumber).toBe('149');
        expect(result.foil).toBe(true);
      });

      it('"MH2-138-EN-NF-2" → MH2 #138 non-foil LP', () => {
        const result = extractor.parseSkuInfo('MH2-138-EN-NF-2');
        expect(result.setCode).toBe('mh2');
        expect(result.collectorNumber).toBe('138');
        expect(result.foil).toBe(false);
      });

      it('"A25-141-EN-FO-3" → A25 #141 foil', () => {
        const result = extractor.parseSkuInfo('A25-141-EN-FO-3');
        expect(result.setCode).toBe('a25');
        expect(result.collectorNumber).toBe('141');
        expect(result.foil).toBe(true);
      });

      it('"2XM-117-EN-NF-1" → 2XM #117 (set code starts with digit)', () => {
        const result = extractor.parseSkuInfo('2XM-117-EN-NF-1');
        expect(result.setCode).toBe('2xm');
        expect(result.collectorNumber).toBe('117');
        expect(result.foil).toBe(false);
      });

      it('"SLD-1638-EN-NF-1" → SLD #1638', () => {
        const result = extractor.parseSkuInfo('SLD-1638-EN-NF-1');
        expect(result.setCode).toBe('sld');
        expect(result.collectorNumber).toBe('1638');
        expect(result.foil).toBe(false);
      });

      it('"STA-42-EN-FO-1" → STA #42 foil', () => {
        const result = extractor.parseSkuInfo('STA-42-EN-FO-1');
        expect(result.setCode).toBe('sta');
        expect(result.collectorNumber).toBe('42');
        expect(result.foil).toBe(true);
      });
    });

    describe('edge cases', () => {
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
  });

  describe('parseTags', () => {
    it('string tags with set name and foil', () => {
      const result = extractor.parseTags(
        'Commander, Common, Duel, Foil, Gladiator, Historicbrawl, Instant, Legacy, Magic 2011, Modern, Normal, Oathbreaker, Pauper, Paupercommander, Predh, Premodern, Red, Vintage',
      );
      expect(result.setName).toBe('Magic 2011');
      expect(result.foil).toBe(true);
    });

    it('array tags with set name', () => {
      const result = extractor.parseTags([
        'Beatdown', 'Commander', 'Common', 'Duel', 'Gladiator',
        'Instant', 'Legacy', 'Modern', 'Normal', 'Red',
      ]);
      expect(result.setName).toBe('Beatdown');
      expect(result.foil).toBe(false);
    });

    it('tags with FINAL FANTASY set name', () => {
      const result = extractor.parseTags([
        'FINAL FANTASY : Through the Ages', 'Foil', 'Instant', 'Normal',
        'Red', 'Uncommon',
      ]);
      expect(result.setName).toBe('FINAL FANTASY : Through the Ages');
      expect(result.foil).toBe(true);
    });

    it('empty tags return empty', () => {
      expect(extractor.parseTags('')).toEqual({});
      expect(extractor.parseTags([])).toEqual({});
      expect(extractor.parseTags(undefined)).toEqual({});
    });
  });

  describe('parseImageFilename', () => {
    it('returns empty (binderpos images have no structured pattern)', () => {
      const result = extractor.parseImageFilename(
        'https://cdn.shopify.com/s/files/1/0367/8204/7276/products/ce13ee16-62fa-536b-a0c0-1e7372ae5520.jpg',
      );
      expect(result).toEqual({});
    });
  });

  describe('integration: real binderpos product data', () => {
    it('GameKnight: Lightning Bolt M11 NM non-foil', () => {
      const titleInfo = extractor.parseTitle('Lightning Bolt [Magic 2011]');
      const skuInfo = extractor.parseSkuInfo('M11-149-EN-NF-1');
      const tagsInfo = extractor.parseTags(
        'Commander, Common, Duel, Foil, Gladiator, Historicbrawl, Instant, Legacy, Magic 2011, Modern, Normal, Oathbreaker, Pauper, Paupercommander, Predh, Premodern, Red, Vintage',
      );

      expect(titleInfo.cardName).toBe('Lightning Bolt');
      expect(titleInfo.setName).toBe('Magic 2011');
      expect(skuInfo.setCode).toBe('m11');
      expect(skuInfo.collectorNumber).toBe('149');
      expect(skuInfo.foil).toBe(false);
      expect(tagsInfo.setName).toBe('Magic 2011');
    });

    it('House of Cards: Lightning Bolt Secret Lair with collector # in parens', () => {
      const titleInfo = extractor.parseTitle('Lightning Bolt (1638) [Secret Lair Drop Series]');
      const skuInfo = extractor.parseSkuInfo('SLD-1638-EN-NF-1');
      const tagsInfo = extractor.parseTags(
        'Commander, Common, Instant, Legacy, Modern, Normal, Red, Secret Lair Drop Series, Vintage',
      );

      expect(titleInfo.cardName).toBe('Lightning Bolt');
      expect(titleInfo.setName).toBe('Secret Lair Drop Series');
      expect(titleInfo.collectorNumber).toBe('1638');
      expect(skuInfo.setCode).toBe('sld');
      expect(skuInfo.collectorNumber).toBe('1638');
      expect(skuInfo.foil).toBe(false);
      expect(tagsInfo.setName).toBe('Secret Lair Drop Series');
    });

    it('House of Cards: Lightning Bolt Strixhaven Mystical Archive', () => {
      const titleInfo = extractor.parseTitle('Lightning Bolt [Strixhaven: School of Mages Mystical Archive]');
      const skuInfo = extractor.parseSkuInfo('STA-42-EN-FO-1');

      expect(titleInfo.cardName).toBe('Lightning Bolt');
      expect(titleInfo.setName).toBe('Strixhaven: School of Mages Mystical Archive');
      expect(skuInfo.setCode).toBe('sta');
      expect(skuInfo.collectorNumber).toBe('42');
      expect(skuInfo.foil).toBe(true);
    });
  });
});
