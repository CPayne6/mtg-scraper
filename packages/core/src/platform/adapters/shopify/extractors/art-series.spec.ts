import { describe, expect, it } from 'vitest';
import { _401CardDetailExtractor } from './_401/_401-card-detail.extractor';
import { BinderposCardDetailExtractor } from './binderpos/binderpos-card-detail.extractor';
import { CgRealmCardDetailExtractor } from './cgrealm/cgrealm-card-detail.extractor';
import { DefaultCardDetailExtractor } from './default/default-card-detail.extractor';
import { F2fCardDetailExtractor } from './f2f/f2f-card-detail.extractor';
import { HobbiesvilleCardDetailExtractor } from './hobbiesville/hobbiesville-card-detail.extractor';

const extractors = [
  ['401 Games', new _401CardDetailExtractor()],
  ['BinderPOS', new BinderposCardDetailExtractor()],
  ['CG Realm', new CgRealmCardDetailExtractor()],
  ['default', new DefaultCardDetailExtractor()],
  ['Face to Face', new F2fCardDetailExtractor()],
  ['Hobbiesville', new HobbiesvilleCardDetailExtractor()],
] as const;

describe('Art Series title detection', () => {
  it.each(extractors)('%s excludes Art Series products before matching', (_store, extractor) => {
    expect(
      extractor.parseTitle('Liberator, Urza’s Battlethopter - Art Series (Gold-Stamped Signature)'),
    ).toMatchObject({ isArtSeries: true, cardName: '' });
  });

  it.each(extractors)('%s excludes Art Card products before matching', (_store, extractor) => {
    expect(
      extractor.parseTitle('Titania, Protector of Argoth Art Card - Modern Horizons 2 Art Series'),
    ).toMatchObject({ isArtSeries: true, cardName: '' });
  });

  it.each([
    'Titania, Protector of Argoth - Art-Card',
    'Titania, Protector of Argoth - art_series',
    'Titania, Protector of Argoth - ArtCard',
  ])('recognizes separator variations: %s', (title) => {
    expect(new CgRealmCardDetailExtractor().parseTitle(title)).toMatchObject({
      isArtSeries: true,
      cardName: '',
    });
  });
});
