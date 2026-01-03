import { F2FSearchParser } from './parsers/F2FParser/F2FSearchParser'
import { _401Parser } from "./parsers/401Parser";
import { HobbiesParser } from "./parsers/HobbiesParser";
import { Card } from "@mtg-scraper/shared";
import { _401Loader, F2FLoader, HobbiesLoader } from "./loaders";
import { HTTPLoader } from "./loaders/HTTPLoader";
import { Parser } from './parsers';

const stores = [
  {
    name: 'Face to Face Games',
    loader: new F2FLoader(),
    parser: new F2FSearchParser() as Parser
  },
  {
    name: '401 Games',
    loader: new _401Loader(),
    parser: new _401Parser() as Parser
  },
  {
    name: 'Hobbiesville',
    loader: new HobbiesLoader(),
    parser: new HobbiesParser() as Parser
  }
]

const purchaseMap: Record<string, Record<string, { cards: Card[]; parserError?: string | boolean | undefined; loaderError?: string | boolean | undefined; api: string }>> = {}

async function fetchCard(cardName: string, loader: HTTPLoader, store: typeof stores[0]) {
  const shortenedCardName = cardName.substring(0, cardName.length - 1)
  const { result, error: loaderError, api } = await loader.search(shortenedCardName)
  const { result: cards, error: parserError } = await store.parser.extractItems(result)

  // Filter out cards that don't start with the card name, we don't want them
  return {
    result: cards.filter(card => card.title.toLocaleLowerCase().startsWith(cardName.toLocaleLowerCase())),
    loaderError,
    parserError,
    api
  }
}

async function run(store: typeof stores[0], cardNames: string[]) {
  for (const cardName of cardNames) {
    console.log('fetching', cardName, 'from store', store.name)
    const { result: cards, loaderError, parserError, api } = await fetchCard(cardName, store.loader, store)
    if (!purchaseMap[cardName]) {
      purchaseMap[cardName] = {}
    }
    purchaseMap[cardName][store.name] = {
      cards: cards?.sort((a, b) => a.price - b.price) ?? [],
      api,
      loaderError,
      parserError
    }
  }
}
