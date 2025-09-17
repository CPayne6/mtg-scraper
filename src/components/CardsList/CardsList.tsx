"use client"

import { CardWithStore } from "@/scraper"
import { Card } from "./Card";
import { Flex } from "@chakra-ui/react";

interface CardListProps {
  loading: boolean
  cards?: CardWithStore[] | null
}

export function CardList({ cards, loading }: CardListProps) {
  return <Flex height="80vh" padding="5" overflowY="scroll">
    <Flex width="80vw" height="fit" gap={2} wrap="wrap" justify="center" shadow="lg" borderRadius="lg" padding="5">
      {(cards && !loading)
        ? cards
          ? cards.length !== 0
            ? cards?.map((card, index) => (<><Card key={card.title + card.store + index} {...card} /></>))
            : <>No cards found</>
          : <>Cannot get card data</>
        : <>...Loading</>
      }
    </Flex>
  </Flex>
}
