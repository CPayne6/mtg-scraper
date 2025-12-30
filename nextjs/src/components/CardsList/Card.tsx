import { AspectRatio, Button, Card as ChakraCard, Flex, IconButton, Text } from "@chakra-ui/react";
import { Tooltip } from "../Tooltip";
import { Image } from "../Image";
import { BsClipboard2Plus } from "react-icons/bs";

interface CardProps {
  title: string;
  store: string;
  price: number;
  image: string;
  link: string;
  condition: string;
  set: string;
  inLibrary: boolean;
  addToLibrary: () => void;
}

export function Card(props: CardProps) {
  return <ChakraCard.Root width="200px" gap={1}>
    <AspectRatio ratio={5 / 7}>
      <Image src={props.image} alt={props.image} height="250px" />
    </AspectRatio>
    <ChakraCard.Body gap="2">
      <Tooltip content={`${props.title} (${props.set})`}>
        <ChakraCard.Title lineClamp={2}>{props.title} ({props.set})</ChakraCard.Title>
      </Tooltip>
      <ChakraCard.Description>{props.store}</ChakraCard.Description>
      <Text textStyle="2xl">${props.price.toFixed(2)} | {props.condition?.toLocaleUpperCase()}</Text>
      <Flex justify="space-between">
        <Button asChild size="sm" w="fit" variant="solid">
        <a href={props.link} target="_blank">See in store</a>
      </Button>
      <IconButton disabled={props.inLibrary} onClick={props.addToLibrary} size="sm" variant="outline">
        <BsClipboard2Plus /> 
      </IconButton>
      </Flex>
      
    </ChakraCard.Body>
  </ChakraCard.Root>
}
