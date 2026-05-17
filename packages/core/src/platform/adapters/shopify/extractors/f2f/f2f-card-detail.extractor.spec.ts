import { describe, it, expect } from 'vitest';
import { F2fCardDetailExtractor } from './f2f-card-detail.extractor';

const extractor = new F2fCardDetailExtractor();

describe('F2fCardDetailExtractor', () => {
  describe('parseTitle', () => {
    describe('3-bracket format: "Card [#] [Set] [Foil]"', () => {
      it('"Accursed Marauder [80] [Modern Horizons 3] [Non-Foil]"', () => {
        const result = extractor.parseTitle('Accursed Marauder [80] [Modern Horizons 3] [Non-Foil]');
        expect(result.cardName).toBe('Accursed Marauder');
        expect(result.setName).toBe('Modern Horizons 3');
        expect(result.collectorNumber).toBe('80');
      });

      it('"Lightning Bolt [146] [Magic 2010] [Non-Foil]"', () => {
        const result = extractor.parseTitle('Lightning Bolt [146] [Magic 2010] [Non-Foil]');
        expect(result.cardName).toBe('Lightning Bolt');
        expect(result.setName).toBe('Magic 2010');
        expect(result.collectorNumber).toBe('146');
      });

      it('"Lightning Bolt [208] [Fourth Edition] [Non-Foil]"', () => {
        const result = extractor.parseTitle('Lightning Bolt [208] [Fourth Edition] [Non-Foil]');
        expect(result.cardName).toBe('Lightning Bolt');
        expect(result.setName).toBe('Fourth Edition');
        expect(result.collectorNumber).toBe('208');
      });

      it('"Ragavan, Nimble Pilferer [138] [Modern Horizons 2] [Foil]"', () => {
        const result = extractor.parseTitle('Ragavan, Nimble Pilferer [138] [Modern Horizons 2] [Foil]');
        expect(result.cardName).toBe('Ragavan, Nimble Pilferer');
        expect(result.setName).toBe('Modern Horizons 2');
        expect(result.collectorNumber).toBe('138');
      });
    });

    describe('2-bracket format: "Card [Set] [Foil]"', () => {
      it('"Lightning Bolt [MagicFest 2019] [Non-Foil]"', () => {
        const result = extractor.parseTitle('Lightning Bolt [MagicFest 2019] [Non-Foil]');
        expect(result.cardName).toBe('Lightning Bolt');
        expect(result.setName).toBe('MagicFest 2019');
        expect(result.collectorNumber).toBeUndefined();
      });

      it('"Jace, the Mind Sculptor [Masters 25] [Foil]"', () => {
        const result = extractor.parseTitle('Jace, the Mind Sculptor [Masters 25] [Foil]');
        expect(result.cardName).toBe('Jace, the Mind Sculptor');
        expect(result.setName).toBe('Masters 25');
      });
    });
  });

  describe('parseSkuInfo', () => {
    describe('new format: SIN-MTG-{SET}-{NUM}-{LANG}-{COND}-{FOIL}', () => {
      it('"SIN-MTG-MH3-80-ENG-NM-NF" → MH3 #80 non-foil', () => {
        const result = extractor.parseSkuInfo('SIN-MTG-MH3-80-ENG-NM-NF');
        expect(result.setCode).toBe('mh3');
        expect(result.collectorNumber).toBe('80');
        expect(result.foil).toBe(false);
      });

      it('"SIN-MTG-MH3-80-ENG-PL-NF" → MH3 #80 non-foil (played)', () => {
        const result = extractor.parseSkuInfo('SIN-MTG-MH3-80-ENG-PL-NF');
        expect(result.setCode).toBe('mh3');
        expect(result.collectorNumber).toBe('80');
        expect(result.foil).toBe(false);
      });

      it('"SIN-MTG-MH2-138-ENG-NM-F" → MH2 #138 foil', () => {
        const result = extractor.parseSkuInfo('SIN-MTG-MH2-138-ENG-NM-F');
        expect(result.setCode).toBe('mh2');
        expect(result.collectorNumber).toBe('138');
        expect(result.foil).toBe(true);
      });

      it('"SIN-MTG-FDC-2-ENG-NM-F" → FDC #2 foil', () => {
        const result = extractor.parseSkuInfo('SIN-MTG-FDC-2-ENG-NM-F');
        expect(result.setCode).toBe('fdc');
        expect(result.collectorNumber).toBe('2');
        expect(result.foil).toBe(true);
      });

      it('"SIN-MTG-4ED-208-ENG-NM-NF" → 4ED #208', () => {
        const result = extractor.parseSkuInfo('SIN-MTG-4ED-208-ENG-NM-NF');
        expect(result.setCode).toBe('4ed');
        expect(result.collectorNumber).toBe('208');
        expect(result.foil).toBe(false);
      });
    });

    describe('legacy format: M-{SET}-{NAME}-{NUM}-{COND}-{FOIL}', () => {
      it('"M-C14-Sol_Ring-270-NM-NF" → C14 #270 non-foil', () => {
        const result = extractor.parseSkuInfo('M-C14-Sol_Ring-270-NM-NF');
        expect(result.setCode).toBe('c14');
        expect(result.collectorNumber).toBe('270');
        expect(result.foil).toBe(false);
      });

      it('"M-ICE-Counterspe-64-NM-NF" → ICE #64 non-foil', () => {
        const result = extractor.parseSkuInfo('M-ICE-Counterspe-64-NM-NF');
        expect(result.setCode).toBe('ice');
        expect(result.collectorNumber).toBe('64');
        expect(result.foil).toBe(false);
      });

      it('"M-C19-Sol_Ring-221-PL-F" → C19 #221 foil', () => {
        const result = extractor.parseSkuInfo('M-C19-Sol_Ring-221-PL-F');
        expect(result.setCode).toBe('c19');
        expect(result.collectorNumber).toBe('221');
        expect(result.foil).toBe(true);
      });
    });

    describe('old format: MP-{NAME}-{SET}-{NUM}-{COND}-{FOIL}', () => {
      it('"MP-Lightnin-PF19-1-NM-NF" → PF19 #1 non-foil', () => {
        const result = extractor.parseSkuInfo('MP-Lightnin-PF19-1-NM-NF');
        expect(result.setCode).toBe('pf19');
        expect(result.collectorNumber).toBe('1');
        expect(result.foil).toBe(false);
      });

      it('"MP-Lightnin-PF19-1-PL-FO" → PF19 #1 foil', () => {
        const result = extractor.parseSkuInfo('MP-Lightnin-PF19-1-PL-FO');
        expect(result.setCode).toBe('pf19');
        expect(result.collectorNumber).toBe('1');
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

  describe('parseImageFilename', () => {
    it('F2F image with set code and collector number', () => {
      const result = extractor.parseImageFilename(
        'https://cdn.shopify.com/s/files/1/0574/4692/4324/files/32fdbd105bf414309384bfe55995aadbe685ad0d_Asset_MTG_M10_146_ENG_NF_jpg.jpg?v=1737551273',
      );
      expect(result.setCode).toBe('m10');
      expect(result.collectorNumber).toBe('146');
    });

    it('F2F image with MH3 set', () => {
      const result = extractor.parseImageFilename(
        'https://cdn.shopify.com/s/files/1/0574/4692/4324/files/411d079bb690ec9873c6f5e68f798adf307f25cb_Asset_MTG_MH3_80_ENG_NF_jpg.jpg?v=1737645030',
      );
      expect(result.setCode).toBe('mh3');
      expect(result.collectorNumber).toBe('80');
    });

    it('F2F image with PF19 promo set', () => {
      const result = extractor.parseImageFilename(
        'https://cdn.shopify.com/s/files/1/0574/4692/4324/files/1e58220fef3975bd74f148d92579e5d376ad21a1_Asset_MTG_PF19_1_ENG_NF_jpg.jpg?v=1737737448',
      );
      expect(result.setCode).toBe('pf19');
      expect(result.collectorNumber).toBe('1');
    });

    it('non-F2F image returns empty', () => {
      const result = extractor.parseImageFilename(
        'https://cdn.shopify.com/s/files/1/0367/8204/7276/products/ce13ee16-62fa-536b-a0c0-1e7372ae5520.jpg',
      );
      expect(result).toEqual({});
    });

    it('undefined returns empty', () => {
      expect(extractor.parseImageFilename(undefined)).toEqual({});
    });
  });

  describe('parseTags', () => {
    it('returns empty (F2F has no useful tags)', () => {
      expect(extractor.parseTags('some, tags')).toEqual({});
      expect(extractor.parseTags(['some', 'tags'])).toEqual({});
      expect(extractor.parseTags(undefined)).toEqual({});
    });
  });

  describe('integration: real F2F product data', () => {
    it('Accursed Marauder NM non-foil (SIN format)', () => {
      const titleInfo = extractor.parseTitle('Accursed Marauder [80] [Modern Horizons 3] [Non-Foil]');
      const skuInfo = extractor.parseSkuInfo('SIN-MTG-MH3-80-ENG-NM-NF');
      const imageInfo = extractor.parseImageFilename(
        'https://cdn.shopify.com/s/files/1/0574/4692/4324/files/411d079bb690ec9873c6f5e68f798adf307f25cb_Asset_MTG_MH3_80_ENG_NF_jpg.jpg',
      );

      expect(titleInfo.cardName).toBe('Accursed Marauder');
      expect(titleInfo.setName).toBe('Modern Horizons 3');
      expect(titleInfo.collectorNumber).toBe('80');
      expect(skuInfo.setCode).toBe('mh3');
      expect(skuInfo.collectorNumber).toBe('80');
      expect(skuInfo.foil).toBe(false);
      expect(imageInfo.setCode).toBe('mh3');
      expect(imageInfo.collectorNumber).toBe('80');
    });

    it('Ragavan foil (SIN format, F foil marker)', () => {
      const titleInfo = extractor.parseTitle('Ragavan, Nimble Pilferer [138] [Modern Horizons 2] [Foil]');
      const skuInfo = extractor.parseSkuInfo('SIN-MTG-MH2-138-ENG-NM-F');

      expect(titleInfo.cardName).toBe('Ragavan, Nimble Pilferer');
      expect(titleInfo.setName).toBe('Modern Horizons 2');
      expect(titleInfo.collectorNumber).toBe('138');
      expect(skuInfo.setCode).toBe('mh2');
      expect(skuInfo.collectorNumber).toBe('138');
      expect(skuInfo.foil).toBe(true);
    });

    it('Sol Ring C14 (legacy M- SKU format)', () => {
      const titleInfo = extractor.parseTitle('Sol Ring [270] [Commander 2014] [Non-Foil]');
      const skuInfo = extractor.parseSkuInfo('M-C14-Sol_Ring-270-NM-NF');
      const imageInfo = extractor.parseImageFilename(
        'https://cdn.shopify.com/s/files/1/0574/4692/4324/files/5f34e2ae1f343300e1b536c7157f9f0cd000fd5e_Asset_MTG_C14_270_ENG_NF_jpg.jpg',
      );

      expect(titleInfo.cardName).toBe('Sol Ring');
      expect(titleInfo.setName).toBe('Commander 2014');
      expect(titleInfo.collectorNumber).toBe('270');
      expect(skuInfo.setCode).toBe('c14');
      expect(skuInfo.collectorNumber).toBe('270');
      expect(skuInfo.foil).toBe(false);
      expect(imageInfo.setCode).toBe('c14');
      expect(imageInfo.collectorNumber).toBe('270');
    });

    it('Counterspell Ice Age (legacy M- SKU format)', () => {
      const titleInfo = extractor.parseTitle('Counterspell [64] [Ice Age] [Non-Foil]');
      const skuInfo = extractor.parseSkuInfo('M-ICE-Counterspe-64-NM-NF');

      expect(titleInfo.cardName).toBe('Counterspell');
      expect(titleInfo.setName).toBe('Ice Age');
      expect(titleInfo.collectorNumber).toBe('64');
      expect(skuInfo.setCode).toBe('ice');
      expect(skuInfo.collectorNumber).toBe('64');
      expect(skuInfo.foil).toBe(false);
    });

    it('Lightning Bolt MagicFest (old MP- SKU format)', () => {
      const titleInfo = extractor.parseTitle('Lightning Bolt [MagicFest 2019] [Non-Foil]');
      const skuInfo = extractor.parseSkuInfo('MP-Lightnin-PF19-1-NM-NF');
      const imageInfo = extractor.parseImageFilename(
        'https://cdn.shopify.com/s/files/1/0574/4692/4324/files/1e58220fef3975bd74f148d92579e5d376ad21a1_Asset_MTG_PF19_1_ENG_NF_jpg.jpg',
      );

      expect(titleInfo.cardName).toBe('Lightning Bolt');
      expect(titleInfo.setName).toBe('MagicFest 2019');
      expect(titleInfo.collectorNumber).toBeUndefined();
      expect(skuInfo.setCode).toBe('pf19');
      expect(skuInfo.collectorNumber).toBe('1');
      expect(imageInfo.setCode).toBe('pf19');
    });
  });
});
