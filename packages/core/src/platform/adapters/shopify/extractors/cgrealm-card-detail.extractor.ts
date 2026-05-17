import { Injectable } from '@nestjs/common';
import type {
  ICardDetailExtractor,
  TitleInfo,
  SkuInfo,
  TagsInfo,
  ImageInfo,
  ProductMetaInfo,
} from '../card-detail-extractor.interface';
import { CardDetailExtractor } from '../card-detail-extractor.decorator';

/**
 * Card detail extractor for The CG Realm.
 *
 * Reliable signals from each part of the Shopify product response:
 *   - vendor: clean set name (e.g. "Zendikar", "Modern Horizons 3 Commander").
 *     Used as the authoritative set name via parseProductMeta.
 *   - sku: "MTG-(LIST-)?{SET}-{NUM}-(F-)?{HASH}-{COND}" — authoritative
 *     setCode + collector + foil flag. Parsed by parseSkuInfo.
 *   - title: only used to extract the cardName, since the title's own set/num
 *     embedding is irregular (varies between "(SET-NUM)", "[brackets]",
 *     "(LIST-...)", and plain text).
 *
 * Sample titles seen in the wild:
 *   "Relic of Progenitus (ALA-218) - Shards of Alara"
 *   "Plains (128) (BRB-) - Battle Royale Box Set"
 *   "World Breaker (OGW-126) - Oath of the Gatewatch: (devoid)"
 *   "Druid's Familiar (LIST-AVR-175) - The List"
 *   "Acorn Catapult (LIST-241/318) - The List"
 *   "Austere Command (Ripple Foil) [Modern Horizons 3 Commander]"
 *   "Riku and Riku [Unknown Event]"
 *   "Drifting Shade"   (plain — no metadata)
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

    // The cardName is everything up to the first " (" or " [" — anything
    // after that is set metadata that vendor/SKU already cover better.
    const splitIndex = findMetadataStart(working);
    let cardName = splitIndex === -1 ? working : working.slice(0, splitIndex).trim();

    // Some legacy products embed the collector number as a leading paren on
    // the card name: "Plains (128)". The SKU doesn't have collector for these
    // (it's just "MTG-BRB-{hash}-{cond}"), so we surface it from the title.
    let collectorNumber: string | undefined;
    const parenNumMatch = cardName.match(/^(.+?)\s*\((\d+)\)\s*$/);
    if (parenNumMatch) {
      cardName = parenNumMatch[1].trim();
      collectorNumber = parenNumMatch[2];
    }

    cardName = stripArtTreatments(cardName);

    // setName is intentionally left empty here — parseProductMeta returns it
    // from the vendor field, which is cleaner than parsing the title.
    return { cardName, collectorNumber, setName: '', foil };
  }

  /**
   * Vendor is the clean set name on CG Realm products (e.g. "Zendikar",
   * "Battle Royale Box Set", "The List"). Returning it here lets the
   * matcher's set-name → set-code lookup do the right thing without us
   * having to parse the title's irregular set markers.
   */
  parseProductMeta(vendor?: string): ProductMetaInfo {
    if (!vendor || !vendor.trim()) return {};
    return { setName: vendor.trim() };
  }

  parseSkuInfo(sku?: string): SkuInfo {
    if (!sku) return {};

    // MTG-(LIST-)?{SET}-{NUM}?-(F-)?{HASH}-{COND}
    //   "MTG-ALA-218-LYP88SPSE0-10"
    //   "MTG-PRE-066-F-3AN6GJRWHH-5"
    //   "MTG-4ED-G2PZRWAKED-5"          (no collector number)
    //   "MTG-LIST-ELD-77-P7GXSN49EZ-1"  (List — inner ELD/77 is what matters)
    const match = sku.match(
      /^MTG-(?:LIST-)?([A-Z0-9_]{2,8})(?:-(\d+[A-Za-z]?))?(?:-(F))?-[A-Z0-9]+-(\d+)$/i,
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
      if (lower === 'foil' || lower === 'printing_foil') foil = true;
      else if (
        lower === 'normal' ||
        lower === 'non-foil' ||
        lower === 'printing_non-foil'
      ) {
        foil = foil ?? false;
      }
    }

    return { foil };
  }

  parseImageFilename(): ImageInfo {
    return {};
  }
}

/**
 * Strip art-treatment / foil suffixes from a card name.
 *
 * Two passes:
 *   1. Any trailing "(... Foil)" — catches Ripple Foil, Surge Foil,
 *      Step-and-Compleat Foil, Halo Foil, Etched Foil, etc. without
 *      needing a hardcoded list.
 *   2. Specific art-treatment keywords that don't include "Foil"
 *      (Borderless, Showcase, Extended Art, etc.)
 */
function stripArtTreatments(name: string): string {
  return name
    .replace(/\s*\([^)]*\s*foil\)\s*$/i, '')
    .replace(
      /\s*\((Borderless|Showcase|Extended Art|Retro Frame|Full Art|Etched|Textured|Surge|Serialized|Gilded|Galaxy|Halo|Concept Praetors|Inverted|Phyrexian|Step-and-Compleat)\)\s*$/i,
      '',
    )
    .trim();
}

/**
 * Find the index where set/printing metadata starts in a CG Realm title.
 *
 * That's the first " (" or " [" after the card name. Returns -1 if the title
 * is plain (no metadata trailer). The single-character lookback ensures we
 * don't split inside the card name itself if it happens to start with "(".
 */
function findMetadataStart(title: string): number {
  for (let i = 1; i < title.length; i++) {
    const ch = title[i];
    if ((ch === '(' || ch === '[') && /\s/.test(title[i - 1])) return i - 1;
  }
  return -1;
}
