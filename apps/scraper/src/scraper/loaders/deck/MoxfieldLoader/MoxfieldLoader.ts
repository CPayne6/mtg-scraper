import { DeckLoader } from '../DeckLoader';
import { MoxfieldResponse } from './api.types';

export class MoxfieldLoader extends DeckLoader {
  constructor(
    public api: string = 'https://api2.moxfield.com/v3/decks/all/{{id}}',
  ) {
    super(api);
  }

  protected parseCardNames(data: string): string[] {
    const cardNames: string[] = [];
    const json: MoxfieldResponse = JSON.parse(data);
    for (const card of Object.values(json?.boards?.commanders?.cards ?? {})) {
      cardNames.push(card.card.name);
    }
    for (const card of Object.values(json?.boards?.companions?.cards ?? {})) {
      // @ts-ignore
      if (card?.card?.name) {
        // @ts-ignore
        cardNames.push(card?.card?.name);
      }
    }
    for (const card of Object.values(json?.boards?.mainboard?.cards ?? {})) {
      if (card?.card?.name) {
        cardNames.push(card.card.name);
      }
    }
    return cardNames;
  }
}
