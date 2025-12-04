"use client"

import { CardWithStore } from "@/scraper"
import { SetStateAction, useEffect, useMemo, useState } from "react"
import { CardList } from "../CardsList";
import { Box, Button, createListCollection, Flex, NumberInput, Text, Heading } from "@chakra-ui/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Select } from "../Select/Select";
import { PreviewLibrary } from "../Library";
import { useLocalStorage } from "@/hooks";

interface DataState {
  cardName: string;
  data: null | CardWithStore[];
  loading: boolean;
}

const fetchCardData = async (name: string) => {
  const response = await fetch('/api/card/' + encodeURIComponent(name))
  return await response.json() as CardWithStore[]
}

interface DeckListProps {
  listName: string;
  pagination?: boolean;
}

export function DeckDisplay({ listName, pagination = true }: DeckListProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const page = Number(searchParams.get('page'))
  const [listStorage] = useLocalStorage<Record<string, string[]>>('deck-lists', {})
  const cardNames = listStorage[listName] ?? []
  const [cardIndex, setCardIndex] = useState((isNaN(page) || page > cardNames.length || page <= 1) ? 0 : page - 1)

  const [data, setDataState] = useState<DataState[]>(cardNames.map(name => ({
    cardName: name,
    loading: true,
    data: null
  })))

  const setDataStateByIndex = (index: number, data: SetStateAction<DataState>) => {
    setDataState((prev) =>
      prev.map(
        (prevData, idx) => idx !== index
          ? prevData
          : typeof data === 'function'
            ? data(prevData)
            : data
      )
    )
  }


  const fetchCardFromIndex = async (index: number) => {
    const cardState = data[index]
    if (!cardState) {
      return
    }
    try {
      const cards = await fetchCardData(cardState.cardName)
      // Replace the cards list in the data state
      setDataStateByIndex(index, (prev) => ({
        ...prev,
        loading: false,
        data: cards
      }))
    }
    catch (err) {
      console.error(err)
    }
  }

  const preloadPage = (index: number) => {
    const dataState = data[index]
    if (dataState?.data) {
      return
    }

    fetchCardFromIndex(index)
  }

  const updatePage = (index: number) => {
    const params = new URLSearchParams(searchParams.toString())
    const cardName = cardNames[index] ?? 'Unknown'
    setCardIndex(index)
    params.set('page', (index + 1).toString())
    params.set('name', cardName)
    router.push(window.location.pathname + '?' + params.toString())
  }

  const onPageChange = (pageStr: string) => {
    const page = Math.max(Math.min(Number(pageStr), cardNames.length), 1)
    updatePage(page - 1)
    preloadPage(page - 2)
    preloadPage(page)
  }

  const onNextPage = () => {
    preloadPage(cardIndex + 2)
    updatePage(cardIndex + 1)
  }

  const onPreviousPage = () => {
    preloadPage(cardIndex - 2)
    updatePage(cardIndex - 1)
  }

  useEffect(() => {
    // Initialize the data before and after the page number
    fetchCardFromIndex(cardIndex)
    preloadPage(cardIndex + 1)
    preloadPage(cardIndex - 1)
  }, [])

  const currentCardData: DataState | undefined = data[cardIndex]
  const collection = useMemo(() => createListCollection({
    items: cardNames.map((name, index) => ({ label: name, value: (index + 1).toString() })).sort((a, b) => a.label.toLocaleLowerCase().localeCompare(b.label.toLocaleLowerCase()))
  }), [cardNames])
  return cardNames.length > 0 ? 
    <Box position="relative">
    <Flex md={{ direction: "column" }} align="center" justify="space-between">
      <Heading size="xl">{currentCardData.cardName}</Heading>
      <Flex md={{ direction: "column" }} gap="5" align="center" justify="end">
        <Flex>
          {currentCardData.cardName && <Select minWidth="200px" maxWidth="300px" collection={collection} size="lg" value={[(cardIndex + 1).toString()]} onValueChange={(e) => onPageChange(e.value[0])} />}
        </Flex>
        {pagination
          && <Flex align="center" gap="1">
            <Text>Page</Text>
            <NumberInput.Root size="xs" width="3em">
              <NumberInput.Input min="1" max={cardNames.length.toString()} value={cardIndex + 1} onChange={(e) => onPageChange(e.target.value)} />
            </NumberInput.Root>
            <Text>of {cardNames.length}</Text>
          </Flex>
        }
        <Flex gap="2">
          <Button onClick={onPreviousPage} disabled={cardIndex === 0} size="sm">Previous</Button>
          <Button onClick={onNextPage} size="sm" disabled={cardIndex >= cardNames.length - 1}>Next</Button>
        </Flex>
        <PreviewLibrary name={currentCardData.cardName} />
      </Flex>
    </Flex>
    <CardList cards={currentCardData.data} loading={currentCardData.loading} />
  </Box>
  : <>No cards found in this list</>
}
