import { Card, Condition } from '@scoutlgs/shared';
import { BaseParser } from '../Parser';
import {
  ConductCommerceSearchResponse,
  ConductCommerceListing,
  ConductCommerceVariant,
} from './search.types';

const CONDUCT_COMMERCE_IMAGE_BASE_URL =
  'https://images.conductcommerce.com/image/upload/f_webp,q_auto:best/';

/**
 * Maps ConductCommerce condition names to our Condition enum values.
 */
const CONDITION_MAP: Record<string, Condition> = {
  'NM/Mint': Condition.NM,
  'Lightly Played': Condition.LP,
  'Moderately Played': Condition.MP,
  'Heavily Played': Condition.HP,
};

/**
 * Regex patterns to extract card number from inventory name.
 * Matches patterns like: (#123), (#A25-141), (SLP, #21)
 */
const CARD_NUMBER_PATTERNS = [
  /\(#([A-Z0-9]+-)?(\d+★?)\)/i, // (#123) or (#A25-141) or (#1638★)
  /\([A-Z0-9]+,\s*#(\d+)\)/i, // (SLP, #21)
];

/**
 * Extracts set code from image path.
 * Image path format: magic_singles/SET_CODE/filename.jpg
 */
function extractSetCodeFromImage(imagePath: string): string {
  if (!imagePath) return '';
  const parts = imagePath.split('/');
  return parts[1]?.toUpperCase() ?? '';
}

/**
 * Regex to extract card name from the beginning of inventory name.
 * Matches everything before parentheses or " - " variant suffix.
 * Examples:
 *   "Lightning Bolt" → "Lightning Bolt"
 *   "Lightning Bolt (#A25-141)" → "Lightning Bolt"
 *   "Lightning Bolt "Hadoken" - Extended Art" → "Lightning Bolt "Hadoken""
 *   "Lightning Bolt - Foil" → "Lightning Bolt"
 */
const CARD_NAME_REGEX = /^(.+?)(?:\s+\(|\s+-\s|$)/;

/**
 * Extracts card number from inventory name and returns clean name.
 * Returns { cardName, cardNumber }
 */
function parseInventoryName(inventoryName: string): {
  cardName: string;
  cardNumber: string;
} {
  let cardNumber = '';

  // Try each pattern to find card number
  for (const pattern of CARD_NUMBER_PATTERNS) {
    const match = inventoryName.match(pattern);
    if (match) {
      // Get the last capturing group that has a value (the actual number)
      cardNumber = match[match.length - 1] ?? match[1] ?? '';
      break;
    }
  }

  // Extract card name from the beginning (before parentheses or " - ")
  const nameMatch = inventoryName.match(CARD_NAME_REGEX);
  const cardName = nameMatch?.[1]?.trim() ?? inventoryName;

  return { cardName, cardNumber };
}

export class ConductCommerceParser extends BaseParser {
  constructor(protected storeHost: string) {
    super();
  }

  async extractItems(
    data: string,
  ): Promise<{ result: Card[]; error?: string }> {
    const cards: Card[] = [];
    let parsedData: ConductCommerceSearchResponse;

    try {
      parsedData = JSON.parse(data);
    } catch (err) {
      this.logger.error('JSON parse error', err);
      return {
        result: [],
        error: `JSON parse error: ${err?.toString() as string}`,
      };
    }

    if (!parsedData.success) {
      const errorMsg = `ConductCommerce API returned errors: ${parsedData.errors.join(', ')}`;
      this.logger.error(errorMsg);
      return {
        result: [],
        error: errorMsg,
      };
    }

    if (!parsedData.result?.listings || !Array.isArray(parsedData.result.listings)) {
      return { result: [] };
    }

    for (const listing of parsedData.result.listings) {
      try {
        const listingCards = this.extractCardsFromListing(listing);
        cards.push(...listingCards);
      } catch (err) {
        this.logger.error('Unexpected listing structure', {
          listing,
          error: err,
        });
        continue;
      }
    }

    return { result: cards };
  }

  private extractCardsFromListing(listing: ConductCommerceListing): Card[] {
    const cards: Card[] = [];

    if (!Array.isArray(listing.variants)) {
      return cards;
    }

    for (const variant of listing.variants) {
      if (variant.quantity > 0 && variant.price > 0) {
        const card = this.createCardFromVariant(listing, variant);
        if (card) {
          cards.push(card);
        }
      }
    }

    return cards;
  }

  private createCardFromVariant(
    listing: ConductCommerceListing,
    variant: ConductCommerceVariant,
  ): Card | null {
    const condition = CONDITION_MAP[variant.name] ?? Condition.UNKNOWN;
    const { cardName, cardNumber } = parseInventoryName(listing.inventoryName);
    const setCode = extractSetCodeFromImage(listing.image);

    return {
      title: cardName,
      price: variant.price,
      condition,
      currency: 'CAD',
      image: this.buildImageUrl(listing.image),
      link: this.buildProductLink(listing.inventoryID),
      set: setCode || listing.categoryName,
      card_number: cardNumber,
    };
  }

  private buildImageUrl(imagePath: string): string {
    if (!imagePath) {
      return '';
    }
    return `${CONDUCT_COMMERCE_IMAGE_BASE_URL}${imagePath}`;
  }

  private buildProductLink(inventoryID: number): string {
    return `https://${this.storeHost}/store/item/${inventoryID}`;
  }
}
