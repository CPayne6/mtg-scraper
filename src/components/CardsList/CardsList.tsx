"use client"

import { CardWithStore } from "@/scraper"
import { Card as DisplayCard } from "./Card";
import { Flex } from "@chakra-ui/react";
import { LibraryStorage } from "../Library";
import { formatStorageName } from "../Library/library.utils";
import { Card } from "@/scraper/card.types";
import { useContext } from "react";
import { LibraryContext } from "@/context";

interface CardListProps {
  loading: boolean
  cards?: CardWithStore[] | null;
}

export function CardList({ cards, loading }: CardListProps) {
  const { library, addToLibrary } = useContext(LibraryContext)
  return <Flex height="80vh" padding="5" overflowY="scroll">
    <Flex width="80vw" height="fit" gap={2} wrap="wrap" justify="center" shadow="lg" borderRadius="lg" padding="5">
      {(cards && !loading)
        ? cards
          ? cards.length !== 0
            ? cards?.map((card, index) => (
              <DisplayCard
                key={card.title + card.store + index}
                {...card}
                inLibrary={!!library?.[formatStorageName(card.title)]}
                addToLibrary={() => addToLibrary({
                  name: card.title,
                  set: card.set,
                  card_number: card.card_number
                })}
              />
            ))
            : <>No cards found</>
          : <>Cannot get card data</>
        : <>...Loading</>
      }
    </Flex>
  </Flex>
}
