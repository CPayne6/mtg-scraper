import { Injectable } from '@nestjs/common';
import type {
  ICardDetailExtractor,
  TitleInfo,
  SkuInfo,
  TagsInfo,
  ImageInfo,
} from '../../card-detail-extractor.interface';
import { CardDetailExtractor } from '../../card-detail-extractor.decorator';

/**
 * Card detail extractor for Hobbiesville.
 *
 * Title formats:
 *   "Card Name (SET-NUM)"
 *   "Card Name (SET-NUM):"
 *   "Card Name (SET-NUM) Foil"
 *   "Card Name (SET-NUM) Snow Foil"
 *   "Card Name (Showcase) (SET-NUM)"
 *   Plain "Card Name" (no set info)
 *
 * SKU format: "MTG-{SET}-{NUM}-(F-)?{HASH}"
 *   e.g. "MTG-KHM-023-F-CGKOLZYTUU" (foil)
 *        "MTG-CLB-660-BCDEF12345"   (non-foil)
 *
 * SKU is the primary source of truth — title is fuzzier (variant suffixes,
 * truncations, missing set info on plain entries).
 */
@CardDetailExtractor('hobbies')
@Injectable()
export class HobbiesvilleCardDetailExtractor implements ICardDetailExtractor {
  parseTitle(title: string): TitleInfo {
    let foil = false;
    let working = title.trim();

    // Strip trailing ":" some Hobbiesville titles have
    working = working.replace(/:\s*$/, '');

    // Detect and strip trailing foil/finish markers
    const trailingFoilRe = /\s+(?:snow\s+)?(?:non-?)?foil$/i;
    if (/\s+foil$/i.test(working) && !/non-?foil$/i.test(working)) {
      foil = true;
    }
    working = working.replace(trailingFoilRe, '').trim();

    // Match "{CardName} (SET-NUM)" possibly preceded by art-variant parens.
    // The (SET-NUM) group is the LAST paren group containing a dash.
    const setNumMatch = working.match(
      /^(.+?)\s*\(([A-Z0-9_]{2,8})-([A-Za-z0-9]+)\)\s*$/,
    );

    if (setNumMatch) {
      let cardName = setNumMatch[1].trim();
      const setCode = setNumMatch[2].toLowerCase();
      const collectorNumber = setNumMatch[3];

      // Strip art-treatment suffixes from card name
      cardName = cardName
        .replace(
          /\s*\((Borderless|Showcase|Extended Art|Retro Frame|Full Art|Etched|Textured|Surge|Serialized|Gilded|Galaxy|Step-and-Compleat|Halo|Inverted|Phyrexian)\)\s*$/i,
          '',
        )
        .trim();

      return { cardName, setCode, collectorNumber, setName: '', foil };
    }

    // Plain title with no set info — strip art treatments and return as-is
    const cleaned = working
      .replace(
        /\s*\((Borderless|Showcase|Extended Art|Retro Frame|Full Art|Etched|Textured|Surge|Serialized|Gilded|Galaxy|Step-and-Compleat|Halo|Inverted|Phyrexian)\)\s*/i,
        ' ',
      )
      .trim();
    return { cardName: cleaned, setName: '', foil };
  }

  parseSkuInfo(sku?: string): SkuInfo {
    if (!sku) return {};

    // MTG-{SET}-{NUM}-(F-)?{HASH}
    // The hash is base32-ish (uppercase letters + digits, 10+ chars).
    // The optional "F-" marks foil. NUM allows trailing letters (e.g. 023a).
    const match = sku.match(
      /^MTG-([A-Z0-9_]{2,8})-(\d+[A-Za-z]?)-(F-)?[A-Z0-9]{6,}$/i,
    );

    if (match) {
      return {
        setCode: match[1].toLowerCase(),
        collectorNumber: match[2],
        foil: match[3] === 'F-',
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
