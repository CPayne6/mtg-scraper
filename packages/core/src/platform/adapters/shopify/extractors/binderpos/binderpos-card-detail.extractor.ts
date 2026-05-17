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
 * Card detail extractor for Binderpos stores (GameKnight, House of Cards, etc.).
 *
 * Title formats:
 *   1-bracket: "Card Name [Set Name]"
 *   With collector#: "Card Name (123) [Set Name]"
 *   Showcase: "Card Name (Showcase) [Set Name]"
 *
 * SKU format: "{SET}-{NUM}-{LANG}-{FOIL}-{COND}"  e.g. "M11-149-EN-NF-1"
 *
 * Tags include set name, foil status, rarity, colors, formats.
 */
@CardDetailExtractor('binderpos')
@Injectable()
export class BinderposCardDetailExtractor implements ICardDetailExtractor {
  private static readonly NON_SET_TAGS = new Set([
    'normal', 'foil', 'etched',
    // Rarities
    'common', 'uncommon', 'rare', 'mythic', 'mythic rare', 'special',
    // Colors
    'white', 'blue', 'black', 'red', 'green', 'colorless', 'multicolor', 'land',
    // Card types / supertypes
    'creature', 'instant', 'sorcery', 'enchantment', 'artifact', 'planeswalker',
    'legendary creature', 'legendary planeswalker', 'legendary enchantment',
    'legendary artifact', 'legendary land',
    // Format legalities
    'commander', 'modern', 'legacy', 'vintage', 'standard', 'pioneer',
    'pauper', 'duel', 'gladiator', 'historicbrawl', 'oathbreaker',
    'paupercommander', 'predh', 'premodern', 'brawl', 'historic', 'alchemy',
    'explorer', 'timeless',
    // Pre-order / store-specific tags
    'pre-order', 'preorder', 'noprice',
  ]);

  parseTitle(title: string): TitleInfo {
    const bracketGroups: string[] = [];
    const bracketRe = /\[([^\]]+)\]/g;
    let match: RegExpExecArray | null;
    while ((match = bracketRe.exec(title)) !== null) {
      bracketGroups.push(match[1].trim());
    }

    if (bracketGroups.length >= 1) {
      let cardName = title.substring(0, title.indexOf('[')).trim();
      let collectorNumber: string | undefined;

      // Check for parenthesized collector number: "Card (123) [Set]"
      const parenCollectorMatch = cardName.match(/^(.+?)\s*\((\d+)\)\s*$/);
      if (parenCollectorMatch) {
        cardName = parenCollectorMatch[1].trim();
        collectorNumber = parenCollectorMatch[2];
      } else {
        // Strip trailing art treatment parenthesized text: (Borderless), (Showcase), etc.
        cardName = cardName.replace(/\s*\((Borderless|Showcase|Extended Art|Retro Frame|Full Art|Etched|Textured|Surge|Serialized|Gilded|Galaxy|Step-and-Compleat|Halo|Concept Praetors|Inverted|Phyrexian)\)\s*$/i, '').trim();
      }

      // 1-bracket: [set name]
      return { cardName, setName: bracketGroups[0], collectorNumber };
    }

    return { cardName: title.trim(), setName: '' };
  }

  parseSkuInfo(sku?: string): SkuInfo {
    if (!sku) return {};

    const parts = sku.split('-');

    // Binderpos format: {SET}-{NUM}-{LANG}-{FOIL}-{COND}
    // SET is 2-5 alphanumeric, NUM is numeric, LANG is 2 chars, FOIL is NF/FO, COND is 1-5
    if (
      parts.length >= 4 &&
      /^[A-Z0-9]{2,5}$/i.test(parts[0]) &&
      /^\d+$/.test(parts[1])
    ) {
      const foilPart = parts.find((p) => p === 'NF' || p === 'FO');
      return {
        setCode: parts[0].toLowerCase(),
        collectorNumber: parts[1],
        foil: foilPart === 'FO',
      };
    }

    return {};
  }

  parseTags(tags?: string[] | string): TagsInfo {
    if (!tags) return {};

    const tagList = typeof tags === 'string'
      ? tags.split(',').map((t) => t.trim()).filter(Boolean)
      : tags;

    if (tagList.length === 0) return {};

    let foil: boolean | undefined;
    let setName: string | undefined;

    for (const tag of tagList) {
      const lower = tag.toLowerCase();
      if (lower === 'foil') {
        foil = true;
      } else if (lower === 'normal') {
        foil = foil ?? false;
      } else if (
        !BinderposCardDetailExtractor.NON_SET_TAGS.has(lower) &&
        !lower.startsWith('brand:') &&
        !lower.startsWith('faction:')
      ) {
        // First unrecognized tag is likely the set name
        if (!setName) {
          setName = tag;
        }
      }
    }

    return { setName, foil };
  }

  parseImageFilename(): ImageInfo {
    // Binderpos images don't have structured filenames
    return {};
  }
}
