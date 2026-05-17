import { Injectable } from '@nestjs/common';
import type {
  ICardDetailExtractor,
  TitleInfo,
  SkuInfo,
  TagsInfo,
  ImageInfo,
} from '../card-detail-extractor.interface';

/**
 * Generic fallback card detail extractor.
 * Used for stores with unknown formats (401 Games, Hobbiesville, etc.).
 *
 * Handles basic title formats: brackets, parenthesis, dash, and plain text.
 */
@Injectable()
export class DefaultCardDetailExtractor implements ICardDetailExtractor {
  parseTitle(title: string): TitleInfo {
    // Try bracket format
    const bracketGroups: string[] = [];
    const bracketRe = /\[([^\]]+)\]/g;
    let match: RegExpExecArray | null;
    while ((match = bracketRe.exec(title)) !== null) {
      bracketGroups.push(match[1].trim());
    }

    if (bracketGroups.length >= 1) {
      let cardName = title.substring(0, title.indexOf('[')).trim();
      let collectorNumber: string | undefined;

      const parenCollectorMatch = cardName.match(/^(.+?)\s*\((\d+)\)\s*$/);
      if (parenCollectorMatch) {
        cardName = parenCollectorMatch[1].trim();
        collectorNumber = parenCollectorMatch[2];
      }

      return {
        cardName,
        setName: bracketGroups[bracketGroups.length >= 2 ? 1 : 0],
        collectorNumber,
      };
    }

    // Try parenthesis format: "Card Name (Set Name)"
    const parenMatch = title.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    if (parenMatch) {
      return { cardName: parenMatch[1].trim(), setName: parenMatch[2].trim() };
    }

    // Try dash format: "Card Name - Set Name"
    const dashMatch = title.match(/^(.+?)\s*-\s*([^-]+)$/);
    if (dashMatch) {
      return { cardName: dashMatch[1].trim(), setName: dashMatch[2].trim() };
    }

    return { cardName: title.trim(), setName: '' };
  }

  parseSkuInfo(sku?: string): SkuInfo {
    if (!sku) return {};

    const parts = sku.split('-');

    // Try generic format: {SET}-{NUM}-...
    if (
      parts.length >= 2 &&
      /^[A-Z0-9]{2,5}$/i.test(parts[0]) &&
      /^\d+$/.test(parts[1])
    ) {
      const foilPart = parts.find((p) => p === 'NF' || p === 'FO');
      return {
        setCode: parts[0].toLowerCase(),
        collectorNumber: parts[1],
        foil: foilPart ? foilPart === 'FO' : undefined,
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
    for (const tag of tagList) {
      const lower = tag.toLowerCase();
      if (lower === 'foil') foil = true;
      else if (lower === 'normal') foil = foil ?? false;
    }

    return { foil };
  }

  parseImageFilename(): ImageInfo {
    return {};
  }
}
