import { Injectable } from '@nestjs/common';
import type {
  ICardDetailExtractor,
  TitleInfo,
  SkuInfo,
  TagsInfo,
  ImageInfo,
  ProductMetaInfo,
} from '../card-detail-extractor.interface';

/**
 * Card detail extractor for 401 Games.
 *
 * Title format: "Card Name (SET_CODE)" or "Card Name (SET_CODE) (Foil)"
 *   e.g. "Teferi's Puzzle Box (8ED)", "Sol Ring (C21)"
 *   Foil variant: "Dinosaur Beast // Human Soldier (004) (IKO Token) (Foil)"
 *   Trailing (Foil)/(Non-Foil) is stripped before parsing.
 *
 * SKU format: "MTG{TYPE}-{CATEGORY}-{SET}-{NUM}{COND}"
 *   Types: N=non-foil, F=foil, TN=token non-foil, TF=token foil, E=etched, A=art series
 *   Non-foil NM:    MTGN-CS_009-8ED-316
 *   Non-foil SP:    MTGN-CS_009-8ED-316SP
 *   Non-foil HP:    MTGN-CS_004-3ED-025HP
 *   Foil NM:        MTGF-F108-SPM-242
 *   Foil SP:        MTGF-F108-SPM-242SP
 *   Token Foil:     MTGTF-F084-TIKO-011B
 *   Token Non-Foil: MTGTN-T078-TM21-002
 *   Etched:         MTGE-E001-2XM-001
 *
 * Tags: "Set_Eighth Edition, Finish_Foil, Foil or Non-Foil_Foil, Rarity_Rare"
 *
 * Image filename: "{Card-Name}-{SET}.jpg"
 *   e.g. "Teferis-Puzzle-Box-8ED.jpg", "Sol-Ring-C21.png"
 */
@Injectable()
export class Four01CardDetailExtractor implements ICardDetailExtractor {
  parseTitle(title: string): TitleInfo {
    // Strip trailing "(Foil)" or "(Non-Foil)" marker before parsing
    let cleaned = title.replace(/\s*\((Non-?Foil|Foil)\)\s*$/i, '').trim();

    // Match last parenthesized group as set code: "Card Name (SET)"
    // 401 uses short set codes like 8ED, 10E, M11, C21, SPM
    const lastParenMatch = cleaned.match(/^(.+?)\s*\(([A-Z0-9]{2,5})\)\s*$/i);
    if (lastParenMatch) {
      let cardName = lastParenMatch[1].trim();

      // Strip metadata suffixes after " - ":
      //   "Kroxa, Titan of Death's Hunger - Promo Pack" → "Kroxa, Titan of Death's Hunger"
      //   "Traverse the Outlands - C17 Reprint" → "Traverse the Outlands"
      //   "Radha, Heart of Keld - Secret Lair High: ..." → "Radha, Heart of Keld"
      //   "Phelia, Exuberant Shepherd - Art Series ..." → "Phelia, Exuberant Shepherd"
      const suffixMatch = cardName.match(/^(.+?)\s+-\s+(?:Promo Pack|.*Reprint|Secret Lair.*|Art Series.*)$/i);
      if (suffixMatch) {
        cardName = suffixMatch[1].trim();
      }

      // Check for collector number in a preceding paren: "Card (123) (SET)"
      const collectorMatch = cardName.match(/^(.+?)\s*\((\d+)\)\s*$/);
      if (collectorMatch) {
        return {
          cardName: collectorMatch[1].trim(),
          setName: '',
          collectorNumber: collectorMatch[2],
        };
      }

      return { cardName, setName: '' };
    }

    // Fallback: try to find any trailing parenthesized group
    const anyParenMatch = cleaned.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    if (anyParenMatch) {
      let cardName = anyParenMatch[1].trim();

      // Strip metadata suffixes here too
      const suffixMatch = cardName.match(/^(.+?)\s+-\s+(?:Promo Pack|.*Reprint|Secret Lair.*|Art Series.*)$/i);
      if (suffixMatch) {
        cardName = suffixMatch[1].trim();
      }

      return {
        cardName,
        setName: anyParenMatch[2].trim(),
      };
    }

    // No parentheses at all
    return { cardName: cleaned.trim(), setName: '' };
  }

  parseSkuInfo(sku?: string): SkuInfo {
    if (!sku) return {};

    // 401 SKU format: MTG{TYPE}-{CATEGORY}-{SET}-{NUM}{COND}
    // Types: N=non-foil, F=foil, TN=token non-foil, TF=token foil, E=etched, A=art series
    // e.g. MTGN-CS_009-8ED-316, MTGF-F108-SPM-242SP, MTGTF-F084-TIKO-011B, MTGA-NR_009-AMH3-046
    const match = sku.match(
      /^MTG(TF|TN|[NFEA])-[A-Z0-9_]+-([A-Z0-9]{2,5})-(\d+[A-Za-z]?)(SP|MP|HP|DMG)?$/i,
    );

    if (match) {
      const type = match[1].toUpperCase();
      return {
        setCode: match[2].toLowerCase(),
        collectorNumber: match[3],
        foil: type === 'F' || type === 'TF',
      };
    }

    return {};
  }

  parseTags(tags?: string[] | string): TagsInfo {
    if (!tags) return {};

    const tagList = typeof tags === 'string'
      ? tags.split(',').map((t) => t.trim())
      : tags;

    if (tagList.length === 0) return {};

    const result: TagsInfo = {};

    for (const tag of tagList) {
      // Set name: "Set_Eighth Edition"
      if (tag.startsWith('Set_')) {
        result.setName = tag.substring(4).trim();
      }

      // Foil: "Finish_Foil" or "Foil or Non-Foil_Foil"
      if (tag === 'Finish_Foil' || tag === 'Foil or Non-Foil_Foil') {
        result.foil = true;
      }
      if (tag === 'Finish_Normal' || tag === 'Foil or Non-Foil_Non-Foil') {
        if (result.foil === undefined) {
          result.foil = false;
        }
      }
    }

    return result;
  }

  parseImageFilename(imageUrl?: string): ImageInfo {
    if (!imageUrl) return {};

    // 401 image filenames: "{Card-Name}-{SET}.jpg" or ".png"
    // e.g. "Teferis-Puzzle-Box-8ED.jpg", "Sol-Ring-C21.png"
    const filenameMatch = imageUrl.match(/\/([^/]+)\.(jpg|png|jpeg|webp)(\?.*)?$/i);
    if (!filenameMatch) return {};

    let filename = filenameMatch[1];
    // Strip trailing "-Foil" or "-Non-Foil" before extracting set code
    filename = filename.replace(/-(Non-?Foil|Foil)$/i, '');
    // Extract trailing set code after the last hyphen
    const setMatch = filename.match(/-([A-Z0-9]{2,5})$/i);
    if (setMatch) {
      return { setCode: setMatch[1].toLowerCase() };
    }

    return {};
  }

  /**
   * Parse product-level metadata: vendor (set name) and body_html (card name).
   * 401 uses vendor field for set name and has structured HTML with card name.
   */
  parseProductMeta(vendor?: string, bodyHtml?: string): ProductMetaInfo {
    const result: ProductMetaInfo = {};

    // 401 vendor = set name (e.g., "Commander 2021", "Theros Beyond Death")
    if (vendor && vendor !== 'Magic: The Gathering' && vendor !== 'Magic') {
      result.setName = vendor;
    }

    // 401 body_html contains: <span class="cardname">Sol Ring</span>
    if (bodyHtml) {
      const cardNameMatch = bodyHtml.match(/<span\s+class="cardname">([^<]+)<\/span>/i);
      if (cardNameMatch) {
        result.cardName = cardNameMatch[1].trim();
      }
    }

    return result;
  }
}
