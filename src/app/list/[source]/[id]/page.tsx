import { CardDisplay } from '@/components/CardDisplay/CardDisplay';
import { MoxfieldLoader, DeckLoader } from '@/scraper/loaders'
import { Heading, Text, Center, Flex, Image, Stack, Box, Button } from '@chakra-ui/react'
import { Suspense } from 'react';

const sourceMap: Record<string, DeckLoader> = {
  moxfield: new MoxfieldLoader()
}

export function generateStaticParams() {
  return []
}

export default async function Page({
  params
}: {
  params: Promise<{ source: string; id: string }>
}) {
  const { source, id } = await params
  const loader = sourceMap[source]
  if (!loader) {
    return <>Unable to find source</>
  }
  else if (!id) {
    return <>Unable to find id</>
  }
  const list = await loader.fetchCards(id)

  return <Flex direction="column" align="center">
    <Box gap="5">
      <Stack direction="row" gap="5" align="center">
        <Image src="/scanner.png" alt="logo" height="100x" width="200px" />
        <Stack>
          <Heading size="4xl">Browse Cards</Heading>
          <Text>Find the cards that you want at the best prices</Text>
          <Button asChild><a href="/">Home</a></Button>
        </Stack>
      </Stack>
      <Suspense  fallback={<>...Loading card list</>}>
        <CardDisplay
          cardNames={list}
        />
      </Suspense>
    </Box >
  </Flex >
}
