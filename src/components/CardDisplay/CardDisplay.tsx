"use client"

import { CardWithStore } from "@/scraper"
import { FormEventHandler, useEffect, useState } from "react"
import { CardList } from "../CardsList";
import { Box, Button, Flex, Heading, Input } from "@chakra-ui/react";
import { useRouter, useSearchParams } from "next/navigation";

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

  const [search, setSearch] = useState(cardName)

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

  const onSubmitCardName: FormEventHandler<HTMLFormElement> = (e) => {
    e.stopPropagation()
    const value = search.trim()
    if (value.length > 0) {
      router.push(`/card/${value}`)
    }
    else {
      alert("Enter a value to search")
    }
  }

  return <Box position="relative">
    <Flex md={{ direction: "column" }} gap="5" align="center" justify="end">
      <Heading size="xl">{cardName}</Heading>
      <form onSubmit={onSubmitCardName}>
        <Flex gap="1">
          <Input placeholder="Card name here" value={search} onChange={(e) => setSearch(e.target.value)} width="200px" />
          <Button type="submit">Search</Button>
        </Flex>
      </form>
    </Flex>
    <CardList cards={data} loading={loading} />
  </Box>
}
