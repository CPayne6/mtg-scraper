import { Card } from "./card.types";
import { _401Loader, F2FLoader, HobbiesLoader, HTTPLoader } from "./loaders";
import { _401Parser, F2FSearchParser, HobbiesParser, Parser } from "./parsers";

interface Store {
  name: string;
  loader: HTTPLoader;
  parser: Parser;
}

const stores: Store[] = [
  {
    name: 'Face to Face Games',
    loader: new F2FLoader(),
    parser: new F2FSearchParser()
  },
  {
    name: '401 Games',
    loader: new _401Loader(),
    parser: new _401Parser()
  },
  {
    name: 'Hobbiesville',
    loader: new HobbiesLoader(),
    parser: new HobbiesParser()
  }
]

export type CardWithStore = Card & { store: string }

const fetchCardFromStore = async (cardName: string, store: Store) => {
  const data = await store.loader.search(cardName);
  const response = await store.parser.extractItems(data.result);
  return response.result.map(card => ({ ...card, store: store.name })).filter(card => card.title.toLocaleLowerCase().replaceAll(/[,\\\/]/g,"").startsWith(cardName.toLocaleLowerCase().replaceAll(/[,\\\/]/g,"")))
}

export async function loadCard(cardName: string) {
  const cards: CardWithStore[] = []

  const cardPromises = stores.map(store => fetchCardFromStore(cardName, store))
  // pull list of cards per store
  const results = await Promise.all(cardPromises)
  for(const result of results){
    cards.push(...result)
  }
  return cards.sort((a, b) => a.price - b.price)
}
