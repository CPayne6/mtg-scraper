import { Card } from "@mtg-scraper/shared";
import { _401Loader, BinderPOSLoader, F2FLoader, HobbiesLoader, HTTPLoader } from "./loaders";
import { _401Parser, BinderPOSParser, F2FSearchParser, HobbiesParser, Parser } from "./parsers";

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
  },
  {
    name: 'House of Cards',
    loader: new BinderPOSLoader('https://houseofcards.ca', 'mtg-advanced-search'),
    parser: new BinderPOSParser('https://houseofcards.ca')
  },
  {
    name: 'Black Knight Games',
    loader: new BinderPOSLoader('https://blackknightgames.ca', 'magic-the-gathering-search'),
    parser: new BinderPOSParser('https://blackknightgames.ca')
  },
  {
    name: 'Exor Games',
    loader: new BinderPOSLoader('https://exorgames.com', 'advanced-search'),
    parser: new BinderPOSParser('https://exorgames.com')
  },
  {
    name: 'Game Knight',
    loader: new BinderPOSLoader('https://gameknight.ca', 'magic-the-gathering-singles'),
    parser: new BinderPOSParser('https://gameknight.ca')
  }
]

export type CardWithStore = Card & { store: string }

type CacheValue = {
  timestamp: number;
  value: unknown;
}

const cache: Record<string, CacheValue> = {}

// cache for 1 day
const cacheTTL = 86400000


const fetchCardFromStore = async (cardName: string, store: Store) => {
  // Check if the card name and store is in the cache
  if(cache[store.name + '-' + cardName] && Date.now() - cache[store.name + '-' + cardName].timestamp < cacheTTL){
    return cache[store.name + '-' + cardName].value as CardWithStore[]
  }

  // On cache miss, fetch the card data
  const data = await store.loader.search(cardName);
  const response = await store.parser.extractItems(data.result);

  const results = response.result.map(card => ({ ...card, store: store.name })).filter(card => card.title.toLocaleLowerCase().replaceAll(/[,\\\/]/g,"").startsWith(cardName.toLocaleLowerCase().replaceAll(/[,\\\/]/g,"")))
  // If no error, cache the result
  if (!response.error){
    cache[store.name + '-' + cardName] = {
      timestamp: Date.now(),
      value: results
    }
  }
  return results
}

export async function loadCard(cardName: string) {
  const cards: CardWithStore[] = []

  const cardPromises = stores.map(store => fetchCardFromStore(cardName, store))
  // Use Promise.allSettled to handle individual store failures gracefully
  const results = await Promise.allSettled(cardPromises)

  for(const result of results){
    if (result.status === 'fulfilled') {
      cards.push(...result.value)
    } else {
      // Log the error but don't fail the entire request
      console.error('Store fetch failed:', result.reason)
    }
  }
  return cards.sort((a, b) => a.price - b.price)
}
