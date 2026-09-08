import { Injectable } from '@nestjs/common';
import { CardDetailExtractor } from '../shopify/card-detail-extractor.decorator';
import { DefaultCardDetailExtractor } from '../shopify/extractors/default/default-card-detail.extractor';

/** Conduct titles use the established bracket/parenthesis conventions today. */
@Injectable()
@CardDetailExtractor('conduct')
export class ConductCardDetailExtractor extends DefaultCardDetailExtractor {}
