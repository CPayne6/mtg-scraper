import { loadCard } from '@/scraper'
import { NextResponse } from 'next/server'

export async function GET(_: unknown, req: { params: Promise<{ cardName: string }> }) {
  const { cardName } = await req.params
  const data = await loadCard(cardName)
  return NextResponse.json(data)
}
