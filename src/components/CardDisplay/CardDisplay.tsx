"use client"

import { CardWithStore } from "@/scraper"
import { FormEventHandler, useEffect, useState } from "react"
import { CardList } from "../CardsList";
import { Box, Button, Flex, Heading, Input } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { PreviewLibrary } from "..";
import SkryfallAutocomplete from "../SkryfallAutocomplete/SkryfallAutocomplete";

interface DataState {
  cardName: string;
  data: null | CardWithStore[];
  loading: boolean;
}

const fetchCardData = async (name: string) => {
  const response = await fetch('/api/card/' + encodeURIComponent(name))
  return await response.json() as CardWithStore[]
}

interface CardListProps {
  cardName: string;
}

export function CardDisplay({ cardName }: CardListProps) {
  const router = useRouter()

  const [data, setData] = useState<CardWithStore[]>()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchCard() {
      setLoading(true)
      try {
        const data = await fetchCardData(cardName)
        setData(data)
      } catch (err) {
        console.error(err)
      }
      finally {
        setLoading(false)
      }
    }
    fetchCard()
  }, [cardName])

  const onSubmitCardName = (cardName: string) => {
    if (cardName.length > 0) {
      router.push(`/card/${cardName}`)
    }
    else {
      alert("Enter a value to search")
    }
  }

  return <Box position="relative">
    <Flex md={{ direction: "column" }} gap="5" align="center" justify="space-between">
      <Heading size="xl">{cardName}</Heading>
      <Flex gap="5" direction="row" align="center">
        <SkryfallAutocomplete initialValue={cardName} placeholder="Card name here" onSelect={onSubmitCardName} />
        <PreviewLibrary name={cardName} />
      </Flex>
    </Flex>
    <CardList cards={data} loading={loading} />
  </Box>
}
