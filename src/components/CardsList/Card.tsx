import { AspectRatio, Button, Card as ChakraCard, Text } from "@chakra-ui/react";
import { Tooltip } from "../Tooltip";
import { Image } from "../Image";

interface CardProps {
  title: string;
  store: string;
  price: number;
  image: string;
  link: string;
  condition: string;
}

export function Card(props: CardProps) {
  return <ChakraCard.Root width="200px" gap={1}>
    <AspectRatio ratio={5 / 7}>
      <Image src={props.image} alt={props.image} height="250px" />
    </AspectRatio>
    <ChakraCard.Body gap="2">
      <Tooltip content={props.title}>
        <ChakraCard.Title lineClamp={2}>{props.title}</ChakraCard.Title>
      </Tooltip>
      <ChakraCard.Description>{props.store}</ChakraCard.Description>
      <Text textStyle="2xl">${props.price.toFixed(2)} | {props.condition?.toLocaleUpperCase()}</Text>
      <Button asChild size="sm" w="fit" variant="solid">
        <a href={props.link} target="_blank">See in store</a>
      </Button>
    </ChakraCard.Body>
  </ChakraCard.Root>
}
