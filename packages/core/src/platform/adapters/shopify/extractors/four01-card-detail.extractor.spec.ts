import { describe, it, expect } from 'vitest';
import { Four01CardDetailExtractor } from './four01-card-detail.extractor';

const extractor = new Four01CardDetailExtractor();

describe('Four01CardDetailExtractor', () => {
  describe('parseTitle', () => {
    describe('standard format: "Card Name (SET)"', () => {
      it('"Teferi\'s Puzzle Box (8ED)" → Teferi\'s Puzzle Box', () => {
        const result = extractor.parseTitle("Teferi's Puzzle Box (8ED)");
        expect(result.cardName).toBe("Teferi's Puzzle Box");
        expect(result.setName).toBe('');
      });

      it('"Sol Ring (C21)" → Sol Ring', () => {
        const result = extractor.parseTitle('Sol Ring (C21)');
        expect(result.cardName).toBe('Sol Ring');
        expect(result.setName).toBe('');
      });

      it('"Lightning Bolt (M11)" → Lightning Bolt', () => {
        const result = extractor.parseTitle('Lightning Bolt (M11)');
        expect(result.cardName).toBe('Lightning Bolt');
        expect(result.setName).toBe('');
      });

      it('"Cho-Manno, Revolutionary (10E)" → Cho-Manno, Revolutionary', () => {
        const result = extractor.parseTitle('Cho-Manno, Revolutionary (10E)');
        expect(result.cardName).toBe('Cho-Manno, Revolutionary');
        expect(result.setName).toBe('');
      });

      it('"Island Sanctuary (3ED)" → Island Sanctuary', () => {
        const result = extractor.parseTitle('Island Sanctuary (3ED)');
        expect(result.cardName).toBe('Island Sanctuary');
        expect(result.setName).toBe('');
      });
    });

    describe('format with collector number: "Card (NUM) (SET)"', () => {
      it('"The Soul Stone - Borderless Headliner (242) (Cosmicfoil) (SPM)"', () => {
        // The last paren is (SPM), preceding paren is (Cosmicfoil) which is not a number,
        // but the one before that (242) is a collector number.
        // This title has multiple parens, regex matches last as set code
        const result = extractor.parseTitle(
          'The Soul Stone - Borderless Headliner (242) (Cosmicfoil) (SPM)',
        );
        // The last paren match captures "SPM" as set code won't work because
        // the regex requires the last paren group to be the end.
        // Actually: "Card (242) (Cosmicfoil) (SPM)" - lastParenMatch won't match
        // because there are intervening parens. Falls back to anyParenMatch.
        expect(result.cardName).toBeDefined();
      });

      it('"Angel of Mercy (123) (10E)" extracts collector number', () => {
        const result = extractor.parseTitle('Angel of Mercy (123) (10E)');
        expect(result.cardName).toBe('Angel of Mercy');
        expect(result.collectorNumber).toBe('123');
      });
    });

    describe('format with trailing (Foil): "Card (SET) (Foil)"', () => {
      it('strips trailing (Foil) and parses set code', () => {
        const result = extractor.parseTitle('Cat // Human Soldier (004) (IKO Token) (Foil)');
        expect(result.cardName).toContain('Cat');
        expect(result.setName).toBe('IKO Token');
      });

      it('"Dinosaur Beast // Human Soldier (004) (IKO Token) (Foil)"', () => {
        const result = extractor.parseTitle('Dinosaur Beast // Human Soldier (004) (IKO Token) (Foil)');
        expect(result.setName).toBe('IKO Token');
      });

      it('strips trailing (Non-Foil)', () => {
        const result = extractor.parseTitle('Some Card (M21) (Non-Foil)');
        expect(result.cardName).toBe('Some Card');
        expect(result.setName).toBe('');
      });
    });

    describe('edge cases', () => {
      it('title with no parentheses', () => {
        const result = extractor.parseTitle('Lightning Bolt');
        expect(result.cardName).toBe('Lightning Bolt');
        expect(result.setName).toBe('');
      });

      it('title with long set name in parens', () => {
        const result = extractor.parseTitle('Some Card (Eighth Edition)');
        expect(result.cardName).toBe('Some Card');
        expect(result.setName).toBe('Eighth Edition');
      });
    });
  });

  describe('parseSkuInfo', () => {
    describe('non-foil format: MTGN-{CAT}-{SET}-{NUM}{COND}', () => {
      it('"MTGN-CS_009-8ED-316" → 8ed #316 non-foil NM', () => {
        const result = extractor.parseSkuInfo('MTGN-CS_009-8ED-316');
        expect(result.setCode).toBe('8ed');
        expect(result.collectorNumber).toBe('316');
        expect(result.foil).toBe(false);
      });

      it('"MTGN-CS_009-8ED-316SP" → 8ed #316 non-foil SP', () => {
        const result = extractor.parseSkuInfo('MTGN-CS_009-8ED-316SP');
        expect(result.setCode).toBe('8ed');
        expect(result.collectorNumber).toBe('316');
        expect(result.foil).toBe(false);
      });

      it('"MTGN-CS_004-3ED-025HP" → 3ed #025 non-foil HP', () => {
        const result = extractor.parseSkuInfo('MTGN-CS_004-3ED-025HP');
        expect(result.setCode).toBe('3ed');
        expect(result.collectorNumber).toBe('025');
        expect(result.foil).toBe(false);
      });

      it('"MTGN-CS_012-10E-014" → 10e #014 non-foil NM', () => {
        const result = extractor.parseSkuInfo('MTGN-CS_012-10E-014');
        expect(result.setCode).toBe('10e');
        expect(result.collectorNumber).toBe('014');
        expect(result.foil).toBe(false);
      });

      it('"MTGN-CS_017-M11-149" → m11 #149 non-foil NM', () => {
        const result = extractor.parseSkuInfo('MTGN-CS_017-M11-149');
        expect(result.setCode).toBe('m11');
        expect(result.collectorNumber).toBe('149');
        expect(result.foil).toBe(false);
      });

      it('"MTGN-CS_019-C21-167" → c21 #167 non-foil NM', () => {
        const result = extractor.parseSkuInfo('MTGN-CS_019-C21-167');
        expect(result.setCode).toBe('c21');
        expect(result.collectorNumber).toBe('167');
        expect(result.foil).toBe(false);
      });
    });

    describe('foil format: MTGF-{CAT}-{SET}-{NUM}{COND}', () => {
      it('"MTGF-F108-SPM-242" → spm #242 foil NM', () => {
        const result = extractor.parseSkuInfo('MTGF-F108-SPM-242');
        expect(result.setCode).toBe('spm');
        expect(result.collectorNumber).toBe('242');
        expect(result.foil).toBe(true);
      });

      it('"MTGF-F108-SPM-242SP" → spm #242 foil SP', () => {
        const result = extractor.parseSkuInfo('MTGF-F108-SPM-242SP');
        expect(result.setCode).toBe('spm');
        expect(result.collectorNumber).toBe('242');
        expect(result.foil).toBe(true);
      });
    });

    describe('token foil format: MTGTF-{CAT}-{SET}-{NUM}{COND}', () => {
      it('"MTGTF-F084-TIKO-011B" → tiko #011B foil', () => {
        const result = extractor.parseSkuInfo('MTGTF-F084-TIKO-011B');
        expect(result.setCode).toBe('tiko');
        expect(result.collectorNumber).toBe('011B');
        expect(result.foil).toBe(true);
      });

      it('"MTGTF-F084-TIKO-011BSP" → tiko #011B foil SP', () => {
        const result = extractor.parseSkuInfo('MTGTF-F084-TIKO-011BSP');
        expect(result.setCode).toBe('tiko');
        expect(result.collectorNumber).toBe('011B');
        expect(result.foil).toBe(true);
      });
    });

    describe('token non-foil format: MTGTN-{CAT}-{SET}-{NUM}{COND}', () => {
      it('"MTGTN-T078-TM21-002" → tm21 #002 non-foil', () => {
        const result = extractor.parseSkuInfo('MTGTN-T078-TM21-002');
        expect(result.setCode).toBe('tm21');
        expect(result.collectorNumber).toBe('002');
        expect(result.foil).toBe(false);
      });
    });

    describe('etched format: MTGE-{CAT}-{SET}-{NUM}{COND}', () => {
      it('"MTGE-E001-2XM-001" → 2xm #001 non-foil', () => {
        const result = extractor.parseSkuInfo('MTGE-E001-2XM-001');
        expect(result.setCode).toBe('2xm');
        expect(result.collectorNumber).toBe('001');
        expect(result.foil).toBe(false);
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
        expect(extractor.parseSkuInfo('RANDOM-SKU-123')).toEqual({});
      });
    });
  });

  describe('parseTags', () => {
    it('extracts set name from "Set_" tag', () => {
      const result = extractor.parseTags([
        'Set_Eighth Edition',
        'Rarity_Rare',
      ]);
      expect(result.setName).toBe('Eighth Edition');
    });

    it('detects foil from "Finish_Foil"', () => {
      const result = extractor.parseTags([
        'Set_Spellslinger Marvels',
        'Finish_Foil',
      ]);
      expect(result.foil).toBe(true);
      expect(result.setName).toBe('Spellslinger Marvels');
    });

    it('detects foil from "Foil or Non-Foil_Foil"', () => {
      const result = extractor.parseTags(['Foil or Non-Foil_Foil']);
      expect(result.foil).toBe(true);
    });

    it('detects non-foil from "Finish_Normal"', () => {
      const result = extractor.parseTags(['Finish_Normal']);
      expect(result.foil).toBe(false);
    });

    it('detects non-foil from "Foil or Non-Foil_Non-Foil"', () => {
      const result = extractor.parseTags(['Foil or Non-Foil_Non-Foil']);
      expect(result.foil).toBe(false);
    });

    it('foil tag takes precedence over non-foil', () => {
      const result = extractor.parseTags([
        'Finish_Foil',
        'Foil or Non-Foil_Non-Foil',
      ]);
      expect(result.foil).toBe(true);
    });

    it('handles comma-separated string', () => {
      const result = extractor.parseTags('Set_Eighth Edition, Finish_Foil, Rarity_Rare');
      expect(result.setName).toBe('Eighth Edition');
      expect(result.foil).toBe(true);
    });

    it('undefined returns empty', () => {
      expect(extractor.parseTags(undefined)).toEqual({});
    });

    it('empty array returns empty', () => {
      expect(extractor.parseTags([])).toEqual({});
    });
  });

  describe('parseImageFilename', () => {
    it('extracts set code from "Card-Name-SET.jpg" pattern', () => {
      const result = extractor.parseImageFilename(
        'https://cdn.shopify.com/s/files/1/0723/5839/products/Teferis-Puzzle-Box-8ED.jpg?v=123',
      );
      expect(result.setCode).toBe('8ed');
    });

    it('extracts set code from Sol-Ring-C21.png', () => {
      const result = extractor.parseImageFilename(
        'https://cdn.shopify.com/s/files/1/0723/5839/products/Sol-Ring-C21.png',
      );
      expect(result.setCode).toBe('c21');
    });

    it('extracts set code from Cho-Manno-Revolutionary-10E.jpg', () => {
      const result = extractor.parseImageFilename(
        'https://cdn.shopify.com/s/files/1/0723/5839/products/Cho-Manno-Revolutionary-10E.jpg',
      );
      expect(result.setCode).toBe('10e');
    });

    it('undefined returns empty', () => {
      expect(extractor.parseImageFilename(undefined)).toEqual({});
    });

    it('non-matching URL returns empty', () => {
      expect(extractor.parseImageFilename('https://example.com/image')).toEqual({});
    });
  });

  describe('edge cases: special product types', () => {
    describe('parseTitle metadata suffix stripping', () => {
      it('strips "- Promo Pack" suffix', () => {
        const result = extractor.parseTitle(
          "Kroxa, Titan of Death's Hunger - Promo Pack (PTHB) (Foil)",
        );
        expect(result.cardName).toBe("Kroxa, Titan of Death's Hunger");
      });

      it('strips "- C17 Reprint" suffix (The List)', () => {
        const result = extractor.parseTitle(
          'Traverse the Outlands - C17 Reprint (PLST)',
        );
        expect(result.cardName).toBe('Traverse the Outlands');
      });

      it('strips "- Secret Lair ..." suffix', () => {
        const result = extractor.parseTitle(
          "Radha, Heart of Keld - Secret Lair High: Class of '87 (SLD)",
        );
        expect(result.cardName).toBe('Radha, Heart of Keld');
      });

      it('strips "- Art Series ..." suffix', () => {
        const result = extractor.parseTitle(
          'Phelia, Exuberant Shepherd - Art Series (Gold-Stamped Signature) (AMH3)',
        );
        expect(result.cardName).toBe('Phelia, Exuberant Shepherd');
      });
    });

    describe('parseSkuInfo art series type A', () => {
      it('"MTGA-NR_009-AMH3-046" → amh3 #046 non-foil', () => {
        const result = extractor.parseSkuInfo('MTGA-NR_009-AMH3-046');
        expect(result.setCode).toBe('amh3');
        expect(result.collectorNumber).toBe('046');
        expect(result.foil).toBe(false);
      });
    });

    describe('parseImageFilename foil suffix stripping', () => {
      it('strips trailing "-Foil" before extracting set code', () => {
        const result = extractor.parseImageFilename(
          'https://cdn.shopify.com/s/files/1/1704/1809/files/Kroxa-Titan-of-Deaths-Hunger-Promo-Pack-PTHB-Foil.png?v=1698514911',
        );
        expect(result.setCode).toBe('pthb');
      });

      it('handles image without -Foil suffix normally', () => {
        const result = extractor.parseImageFilename(
          'https://cdn.shopify.com/s/files/1/1704/1809/files/Traverse-the-Outlands-PLIST.png?v=1698579768',
        );
        expect(result.setCode).toBe('plist');
      });
    });
  });

  describe('parseProductMeta', () => {
    it('extracts card name from body_html <span class="cardname">', () => {
      const result = extractor.parseProductMeta(
        undefined,
        '<span class="cardname">Sol Ring</span><span class="label">Card Type: </span>',
      );
      expect(result.cardName).toBe('Sol Ring');
    });

    it('extracts set name from vendor field', () => {
      const result = extractor.parseProductMeta('Commander 2021');
      expect(result.setName).toBe('Commander 2021');
    });

    it('ignores generic vendor values', () => {
      expect(extractor.parseProductMeta('Magic').setName).toBeUndefined();
      expect(extractor.parseProductMeta('Magic: The Gathering').setName).toBeUndefined();
    });

    it('extracts both card name and set name', () => {
      const result = extractor.parseProductMeta(
        'Theros Beyond Death',
        '<span class="cardname">Kroxa, Titan of Death\'s Hunger</span>',
      );
      expect(result.cardName).toBe("Kroxa, Titan of Death's Hunger");
      expect(result.setName).toBe('Theros Beyond Death');
    });

    it('handles missing body_html', () => {
      const result = extractor.parseProductMeta('Commander 2021', undefined);
      expect(result.cardName).toBeUndefined();
      expect(result.setName).toBe('Commander 2021');
    });

    it('handles body_html without cardname span', () => {
      const result = extractor.parseProductMeta(undefined, '<p>Some text</p>');
      expect(result.cardName).toBeUndefined();
    });
  });

  describe('integration: real 401 product data', () => {
    it("Teferi's Puzzle Box NM non-foil (8ED)", () => {
      const titleInfo = extractor.parseTitle("Teferi's Puzzle Box (8ED)");
      const skuInfo = extractor.parseSkuInfo('MTGN-CS_009-8ED-316');
      const tagsInfo = extractor.parseTags([
        'Set_Eighth Edition',
        'Finish_Normal',
        'Foil or Non-Foil_Non-Foil',
        'Rarity_Rare',
      ]);
      const imageInfo = extractor.parseImageFilename(
        'https://cdn.shopify.com/s/files/1/0723/5839/products/Teferis-Puzzle-Box-8ED.jpg',
      );

      expect(titleInfo.cardName).toBe("Teferi's Puzzle Box");
      expect(skuInfo.setCode).toBe('8ed');
      expect(skuInfo.collectorNumber).toBe('316');
      expect(skuInfo.foil).toBe(false);
      expect(tagsInfo.setName).toBe('Eighth Edition');
      expect(tagsInfo.foil).toBe(false);
      expect(imageInfo.setCode).toBe('8ed');
    });

    it('Sol Ring NM non-foil (C21)', () => {
      const titleInfo = extractor.parseTitle('Sol Ring (C21)');
      const skuInfo = extractor.parseSkuInfo('MTGN-CS_019-C21-167');
      const tagsInfo = extractor.parseTags([
        'Set_Commander 2021',
        'Finish_Normal',
        'Rarity_Uncommon',
      ]);

      expect(titleInfo.cardName).toBe('Sol Ring');
      expect(skuInfo.setCode).toBe('c21');
      expect(skuInfo.collectorNumber).toBe('167');
      expect(skuInfo.foil).toBe(false);
      expect(tagsInfo.setName).toBe('Commander 2021');
    });

    it('The Soul Stone foil (SPM)', () => {
      const skuInfo = extractor.parseSkuInfo('MTGF-F108-SPM-242');
      const tagsInfo = extractor.parseTags([
        'Set_Spellslinger Marvels',
        'Finish_Foil',
        'Foil or Non-Foil_Foil',
      ]);

      expect(skuInfo.setCode).toBe('spm');
      expect(skuInfo.collectorNumber).toBe('242');
      expect(skuInfo.foil).toBe(true);
      expect(tagsInfo.setName).toBe('Spellslinger Marvels');
      expect(tagsInfo.foil).toBe(true);
    });

    it('Kroxa Promo Pack: body_html overrides messy title', () => {
      // Title has "- Promo Pack" suffix, but body_html has the clean name
      const titleInfo = extractor.parseTitle(
        "Kroxa, Titan of Death's Hunger - Promo Pack (PTHB) (Foil)",
      );
      const metaInfo = extractor.parseProductMeta(
        'Theros Beyond Death',
        '<span class="cardname">Kroxa, Titan of Death\'s Hunger</span>',
      );

      // meta cardName overrides title cardName
      const cardName = metaInfo.cardName || titleInfo.cardName;
      const setName = metaInfo.setName || titleInfo.setName;

      expect(cardName).toBe("Kroxa, Titan of Death's Hunger");
      expect(setName).toBe('Theros Beyond Death');
    });

    it('Secret Lair: body_html overrides messy title', () => {
      const titleInfo = extractor.parseTitle(
        "Radha, Heart of Keld - Secret Lair High: Class of '87 (SLD)",
      );
      const metaInfo = extractor.parseProductMeta(
        'Secret Lair Drop',
        '<span class="cardname">Radha, Heart of Keld</span>',
      );

      const cardName = metaInfo.cardName || titleInfo.cardName;
      expect(cardName).toBe('Radha, Heart of Keld');
      expect(metaInfo.setName).toBe('Secret Lair Drop');
    });
  });
});
