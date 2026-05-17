import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key used by the registry to discover extractors.
 */
export const CARD_DETAIL_EXTRACTOR_METADATA = 'card_detail_extractor:scraper_types';

/**
 * Mark a class as a card detail extractor for one or more scraper types.
 *
 * The CardDetailExtractorRegistry discovers all decorated classes on boot
 * via NestJS DiscoveryService and builds the scraperType → extractor map
 * automatically. New extractors only need this decorator + class registration
 * in PlatformModule providers — no factory updates required.
 *
 * @example
 * ```typescript
 * @CardDetailExtractor('cgrealm')
 * @Injectable()
 * export class CgRealmCardDetailExtractor implements ICardDetailExtractor { }
 * ```
 *
 * Multiple keys are supported for extractors that handle several store variants:
 * ```typescript
 * @CardDetailExtractor('binderpos', 'binderpos-classic')
 * ```
 */
export function CardDetailExtractor(
  ...scraperTypes: string[]
): ClassDecorator {
  return SetMetadata(CARD_DETAIL_EXTRACTOR_METADATA, scraperTypes);
}
