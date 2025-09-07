"use client"

import { CardWithStore } from "@/scraper"
import { Card } from "./Card";

interface CardListProps {
  cards: CardWithStore[]
}

export function CardList({ cards }: CardListProps) {
  return cards?.map((card, index) => (<><Card key={card.title + card.store + index} {...card} /></>))
}
