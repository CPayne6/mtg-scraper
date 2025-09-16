import { Select as ChakraSelect, Portal, SelectRootProps } from "@chakra-ui/react"

export function Select(props: SelectRootProps) {
  const { collection } = props;
  return <ChakraSelect.Root {...props}>
    <ChakraSelect.HiddenSelect />
    <ChakraSelect.Control>
      <ChakraSelect.Trigger>
        <ChakraSelect.ValueText defaultValue={props.value} />
      </ChakraSelect.Trigger>
      <ChakraSelect.IndicatorGroup>
        <ChakraSelect.Indicator />
      </ChakraSelect.IndicatorGroup>
    </ChakraSelect.Control>
    <Portal>
      <ChakraSelect.Positioner>
        <ChakraSelect.Content>
          {collection.items.map((option) => (
            <ChakraSelect.Item item={option} key={option.value}>
              {option.label}
              <ChakraSelect.ItemIndicator />
            </ChakraSelect.Item>
          ))}
        </ChakraSelect.Content>
      </ChakraSelect.Positioner>
    </Portal>
  </ChakraSelect.Root >
}