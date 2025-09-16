import { loadCard } from '@/scraper'
import { NextResponse } from 'next/server'

type CacheValue = {
  timestamp: number;
  value: unknown;
}

const cache: Record<string, CacheValue> = {}

const cacheTTL = 100000

export async function GET(_: unknown, req: { params: Promise<{ cardName: string }> }) {
  const { cardName } = await req.params
  if(cache[cardName] && Date.now() - cache[cardName].timestamp < cacheTTL){
    return NextResponse.json(cache[cardName].value)
  }
  const data = await loadCard(cardName)
  cache[cardName] = {
    timestamp: Date.now(),
    value: data
  }
  return NextResponse.json(data)
}
