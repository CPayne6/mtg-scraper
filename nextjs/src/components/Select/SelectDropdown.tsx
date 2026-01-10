import { Select as ChakraSelect, ListCollection, Portal } from "@chakra-ui/react"

interface SelectDropdownProps {
  items: ListCollection<any>["items"];
}

export function SelectDropdown({ items }: SelectDropdownProps) {
  return (
    <Portal>
      <ChakraSelect.Positioner>
        <ChakraSelect.Content>
          {items.map((option) => (
            <ChakraSelect.Item item={option} key={option.value}>
              {option.label}
              <ChakraSelect.ItemIndicator />
            </ChakraSelect.Item>
          ))}
        </ChakraSelect.Content>
      </ChakraSelect.Positioner>
    </Portal>
  )
}
