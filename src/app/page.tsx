"use client";

import { UploadLibrary } from '@/components';
import { useLocalStorage } from '@/hooks';
import { cardNameRegex } from '@/scraper/loaders'
import { generateRandomName } from '@/utils/randomNameGenerator';
import { Field } from '@ark-ui/react'
import { Heading, Text, Center, Flex, Image, Stack, Input, Button, Textarea } from '@chakra-ui/react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function Home() {
  const [listName, setListName] = useState<string>('') // TODO: let them enter a custom name
  const [cardsList, setCardsList] = useState<string>('')
  const [cardName, setCardName] = useState<string>('')

  const [deckListHelperText, setMoxHelperText] = useState<string>()
  const [nameHelperText, setNameHelperText] = useState<string>()
  const [listStorage, setListStorage] = useLocalStorage<Record<string, string[]>>('deck-lists', {})

  const router = useRouter()

  const onSubmitCardList = () => {
    if (!cardsList || cardsList.length === 0) {
      setMoxHelperText("Enter a deck list to get started")
      return
    }
    const cardsListArr = []
    for(const cardNameRaw of cardsList.split('\n')) {
      if(cardNameRaw.trim() === ''){
        continue;
      }

      const cardName = cardNameRegex.exec(cardNameRaw)?.[1].trim()
      if(cardName && cardName.length !== 0) {
        cardsListArr.push(cardName)
      }
    }

    if (cardsListArr.length === 0) {
      setMoxHelperText("Unable to read link")
      return
    }

    const cleanedListName = listName.replaceAll(/\W/g, '')
    const storageName = cleanedListName.length > 0 ? cleanedListName : generateRandomName()
    setListStorage({ ...listStorage, [storageName]: cardsListArr})
    router.push(`/list/${storageName}`)
  }

  const onSubmitCardName = () => {
    const name = cardName.trim()
    if (!name || name.length === 0) {
      setNameHelperText("Enter the entire name")
      return
    }
    router.push(`/card/${encodeURIComponent(name)}`)
  }

  return <Center bg="Background" h="100vh" w="100vw">
    <Flex direction="column" align="center">
      <Stack direction="column" gap="10">
        <Stack direction="column" gap="5" align="center">
          <Image src="/scanner.png" alt="logo" height="200px" width="200px" />
          <Heading size="4xl">MTG Card Finder</Heading>
          <Text>Search accross Hobbiesville, 401 Games and FacetoFace Games</Text>
        </Stack>

        <Stack gap={3} align="start" width="500px">
          <div><UploadLibrary /></div>
          <Field.Root>
            <Field.Label>
              Paste your cards list here
            </Field.Label>
            <Textarea placeholder="Cards list here" value={cardsList} onSubmit={onSubmitCardList} onChange={(e) => setCardsList(e.target.value)} />
            {deckListHelperText && deckListHelperText.length > 0 && <Field.HelperText>{deckListHelperText}</Field.HelperText>}
          </Field.Root>
          <Button variant="surface" onClick={onSubmitCardList}>
            Let&apos;s Go!
          </Button>
        </Stack>
        <Stack gap={3} align="start" width="500px">
          <Field.Root>
            <Field.Label>
              Paste your card name here
            </Field.Label>
            <Input placeholder="Card name here" value={cardName} onSubmit={onSubmitCardName} onChange={(e) => setCardName(e.target.value)} />
            {nameHelperText && nameHelperText.length > 0 && <Field.HelperText>{nameHelperText}</Field.HelperText>}
          </Field.Root>
          <Button variant="surface" onClick={onSubmitCardName}>
            Let&apos;s Go!
          </Button>
        </Stack>
      </Stack>
    </Flex>
  </Center>
}
