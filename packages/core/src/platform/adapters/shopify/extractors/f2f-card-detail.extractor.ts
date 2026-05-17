import { Injectable } from '@nestjs/common';
import type {
  ICardDetailExtractor,
  TitleInfo,
  SkuInfo,
  TagsInfo,
  ImageInfo,
} from '../card-detail-extractor.interface';
import { CardDetailExtractor } from '../card-detail-extractor.decorator';

/**
 * Card detail extractor for Face to Face Games (F2F).
 *
 * Title formats:
 *   3-bracket: "Card Name [80] [Modern Horizons 3] [Non-Foil]"
 *   2-bracket: "Card Name [MagicFest 2019] [Non-Foil]"
 *
 * SKU formats:
 *   New:    "SIN-MTG-{SET}-{NUM}-{LANG}-{COND}-{FOIL}"  (FOIL = F|NF)
 *   Legacy: "M-{SET}-{NAME}-{NUM}-{COND}-{FOIL}"        (FOIL = F|NF)
 *   Old:    "MP-{NAME}-{SET}-{NUM}-{COND}-{FOIL}"       (FOIL = FO|NF)
 *
 * Image URLs: "Asset_MTG_{SET}_{NUM}_{LANG}_{FOIL}_jpg.jpg"
 */
@CardDetailExtractor('f2f')
@Injectable()
export class F2fCardDetailExtractor implements ICardDetailExtractor {
  parseTitle(title: string): TitleInfo {
    const bracketGroups: string[] = [];
    const bracketRe = /\[([^\]]+)\]/g;
    let match: RegExpExecArray | null;
    while ((match = bracketRe.exec(title)) !== null) {
      bracketGroups.push(match[1].trim());
    }

    if (bracketGroups.length < 2) {
      // Not a recognized F2F multi-bracket format — basic fallback
      const cardName = bracketGroups.length === 1
        ? title.substring(0, title.indexOf('[')).trim()
        : title.trim();
      return { cardName, setName: bracketGroups[0] || '' };
    }

    const cardName = title.substring(0, title.indexOf('[')).trim();

    if (bracketGroups.length >= 3) {
      // F2F 3-bracket: [collector#] [set name] [foil status]
      return {
        cardName,
        setName: bracketGroups[1],
        collectorNumber: bracketGroups[0],
      };
    }

    // F2F 2-bracket: [set name] [foil status]
    return { cardName, setName: bracketGroups[0] };
  }

  parseSkuInfo(sku?: string): SkuInfo {
    if (!sku) return {};

    const parts = sku.split('-');

    // F2F new format: SIN-MTG-{SET}-{NUM}-{LANG}-{COND}-{FOIL}
    // Foil status: F = foil, NF = non-foil
    if (parts[0] === 'SIN' && parts[1] === 'MTG' && parts.length >= 7) {
      return {
        setCode: parts[2].toLowerCase(),
        collectorNumber: parts[3],
        foil: parts[6] === 'F',
      };
    }

    // F2F legacy format: M-{SET}-{NAME}-{NUM}-{COND}-{FOIL}
    // e.g. M-C14-Sol_Ring-270-NM-NF, M-ICE-Counterspe-64-PL-F
    if (parts[0] === 'M' && parts.length >= 6) {
      // SET is parts[1], then name segments, then NUM-COND-FOIL at the end
      // Walk backwards: last = foil, second-to-last = condition, before that = collector#
      const foilPart = parts[parts.length - 1];
      const collectorNumber = parts[parts.length - 3];
      if (/^\d+$/.test(collectorNumber)) {
        return {
          setCode: parts[1].toLowerCase(),
          collectorNumber,
          foil: foilPart === 'F' || foilPart === 'FO',
        };
      }
    }

    // F2F old/marketplace format: MP-{NAME}-{SET}-{NUM}-{COND}-{FOIL}
    if (parts[0] === 'MP' && parts.length >= 6) {
      // Find the set code: segment after name that looks like a set code
      // Set codes are 2-5 uppercase alpha chars, possibly with digits (e.g., MH3, 2XM, PF19)
      for (let i = 2; i < parts.length - 3; i++) {
        if (/^[A-Z0-9]{2,5}$/i.test(parts[i]) && /^\d+$/.test(parts[i + 1])) {
          return {
            setCode: parts[i].toLowerCase(),
            collectorNumber: parts[i + 1],
            foil: parts[parts.length - 1] === 'FO',
          };
        }
      }
    }

    return {};
  }

  parseTags(): TagsInfo {
    // F2F products don't include useful tags
    return {};
  }

  parseImageFilename(imageUrl?: string): ImageInfo {
    if (!imageUrl) return {};

    const match = imageUrl.match(/Asset_MTG_([A-Z0-9]{2,5})_(\d+)_/i);
    if (match) {
      return {
        setCode: match[1].toLowerCase(),
        collectorNumber: match[2],
      };
    }

    return {};
  }
}
