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
 * Card detail extractor for The CG Realm.
 *
 * Title format: "{CardName} ({SET-NUM}) - {Set Name}"
 *   e.g. "Brainwash (4ED-) - Fourth Edition"
 *        "Relic of Progenitus (ALA-218) - Shards of Alara"
 *        "Plains (128) (BRB-) - Battle Royale Box Set"
 *        "World Breaker (OGW-126) - Oath of the Gatewatch: (devoid)"
 *        "Wall of Roots (FNM-) - Friday Night Magic 2008 Foil"
 *
 * SKU format: "MTG-{SET}-{NUM}-{HASH}-{COND}" or "MTG-{SET}-{NUM}-F-{HASH}-{COND}"
 *   e.g. "MTG-ALA-218-LYP88SPSE0-10"
 *        "MTG-PRE-066-F-3AN6GJRWHH-5"  (F = foil)
 *   COND codes: 5=NM, 10=LP/MP, 15=HP, 20=DMG (varies)
 */
@CardDetailExtractor('cgrealm')
@Injectable()
export class CgRealmCardDetailExtractor implements ICardDetailExtractor {
  parseTitle(title: string): TitleInfo {
    let foil = false;
    let working = title;

    // Strip trailing " Foil" / " Non-Foil" suffix
    if (/\s+foil$/i.test(working)) {
      foil = true;
      working = working.replace(/\s+foil$/i, '').trim();
    } else if (/\s+non-?foil$/i.test(working)) {
      working = working.replace(/\s+non-?foil$/i, '').trim();
    }

    // Strip trailing " : (descriptor)" pattern like ": (devoid)"
    working = working.replace(/\s*:\s*\([^)]+\)\s*$/, '').trim();

    // Match: {CardName} ({SET-NUM}) - {SetName}
    // The (SET-NUM) part: SET is letters/digits, NUM is optional digits (may be alphanumeric)
    const match = working.match(
      /^(.+?)\s*\(([A-Z0-9_]{2,8})-([A-Za-z0-9]*)\)\s*-\s*(.+)$/,
    );

    if (match) {
      let cardName = match[1].trim();
      const setCode = match[2].toLowerCase();
      const collectorNumber = match[3] || undefined;
      const setName = match[4].trim();

      // Some cards have art-variant info: "Plains (128) (BRB-) - Battle Royale Box Set"
      // The leading "(128)" is the collector number, the "(BRB-)" has no number
      // Move parenthesized number from card name into collectorNumber if not already set
      if (!collectorNumber) {
        const parenNumMatch = cardName.match(/^(.+?)\s*\((\d+)\)\s*$/);
        if (parenNumMatch) {
          cardName = parenNumMatch[1].trim();
          return {
            cardName,
            setCode,
            collectorNumber: parenNumMatch[2],
            setName,
            foil,
          };
        }
      }

      // Strip art-treatment suffixes from card name
      cardName = cardName
        .replace(
          /\s*\((Borderless|Showcase|Extended Art|Retro Frame|Full Art|Etched|Textured|Surge|Serialized|Gilded|Galaxy|Step-and-Compleat|Halo|Concept Praetors|Inverted|Phyrexian|Foil)\)\s*$/i,
          '',
        )
        .trim();

      return { cardName, setCode, collectorNumber, setName, foil };
    }

    // Fallback: no set info embedded — just a plain card name
    return { cardName: working.trim(), setName: '', foil };
  }

  parseSkuInfo(sku?: string): SkuInfo {
    if (!sku) return {};

    // MTG-{SET}-{NUM}-(F-)?{HASH}-{COND}
    // e.g. "MTG-ALA-218-LYP88SPSE0-10"
    //      "MTG-PRE-066-F-3AN6GJRWHH-5"
    //      "MTG-4ED-G2PZRWAKED-5" (no collector number)
    const match = sku.match(
      /^MTG-([A-Z0-9_]{2,8})(?:-(\d+[A-Za-z]?))?(?:-(F))?-[A-Z0-9]+-(\d+)$/i,
    );

    if (match) {
      return {
        setCode: match[1].toLowerCase(),
        collectorNumber: match[2] || undefined,
        foil: match[3] === 'F',
      };
    }

    return {};
  }

  parseTags(tags?: string[] | string): TagsInfo {
    if (!tags) return {};

    const tagList =
      typeof tags === 'string'
        ? tags.split(',').map((t) => t.trim()).filter(Boolean)
        : tags;

    if (tagList.length === 0) return {};

    let foil: boolean | undefined;
    for (const tag of tagList) {
      const lower = tag.toLowerCase();
      if (lower === 'foil') foil = true;
      else if (lower === 'normal' || lower === 'non-foil') foil = foil ?? false;
    }

    return { foil };
  }

  parseImageFilename(): ImageInfo {
    return {};
  }
}
