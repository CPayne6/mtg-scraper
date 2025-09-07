"use client";

import { defaultIdRegex, domainRegex } from '@/scraper/loaders'
import { Field } from '@ark-ui/react'
import { Heading, Text, Center, Flex, Image, Stack, Input, Button } from '@chakra-ui/react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

const supportedSites = ['moxfield']

export default function Home() {
  const [moxfieldLink, setMoxfieldLink] = useState<string>('')
  const [helperText, setHelperText] = useState<string>()

  const router = useRouter()

  const onSubmit = () => {
    if (!moxfieldLink || moxfieldLink.length === 0) {
      setHelperText("Enter a moxfield link to get started")
      return
    }
    const id = defaultIdRegex.exec(moxfieldLink)?.[1];
    const type = domainRegex.exec(moxfieldLink)?.[1];

    if (!id || !type || !supportedSites.includes(type)) {
      setHelperText("Unable to read link")
      return
    }
    router.push(`/list/${type}/${id}`)
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
          <Field.Root>
            <Field.Label>
              Paste your moxfield link here
            </Field.Label>
            <Input placeholder="Moxfield link here" value={moxfieldLink} onSubmit={onSubmit} onChange={(e) => setMoxfieldLink(e.target.value)} />
            {helperText && helperText.length > 0 && <Field.HelperText>{helperText}</Field.HelperText>}
          </Field.Root>
          <Button variant="surface" onClick={onSubmit}>
            Let&apos;s Go!
          </Button>
        </Stack>
      </Stack>
    </Flex>
  </Center>
}
