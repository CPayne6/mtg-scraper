import { Select as ChakraSelect, SelectRootProps } from "@chakra-ui/react"
import { SelectDropdown } from "./SelectDropdown";

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
    <SelectDropdown items={collection.items} />
  </ChakraSelect.Root >
}