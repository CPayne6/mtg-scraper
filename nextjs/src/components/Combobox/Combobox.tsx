"use client"

import {
  Combobox as ChakraCombobox,
  ComboboxInputValueChangeDetails,
  createListCollection,
  HStack,
  Portal,
  Span
} from "@chakra-ui/react"
import { useMemo } from "react"

interface ComboboxProps {
  value: string;
  selectedOption?: string;
  options: string[]
  onChange?: (value: string) => void;
  onSuggestionSelect?: (value: string) => void;
  placeholder?: string;
  isDisabled?: boolean;
  size?: "sm" | "md" | "lg";
}

export const Combobox = ({
  value,
  selectedOption,
  options,
  onChange,
  onSuggestionSelect,
  placeholder = "Start typing...",
  isDisabled = false,
  size = "md"
}: ComboboxProps) => {
  const collection = useMemo(() => createListCollection({
    items: options.map((option) => ({ label: option, value: option }))
  }), [options])

  const onInputValueChange = (e: ComboboxInputValueChangeDetails) => {  
    onChange?.(e.inputValue)
  }

  const onValueChange = (details: ChakraCombobox.ValueChangeDetails) => {
    onSuggestionSelect?.(details.value[0] || "")
  }


  return (
    <ChakraCombobox.Root
      width="320px"
      inputValue={value}
      value={selectedOption ? [selectedOption] : undefined}
      collection={collection}
      placeholder={placeholder}
      disabled={isDisabled}
      size={size}
      inputBehavior="autohighlight"
      onInputValueChange={onInputValueChange}
      onValueChange={onValueChange}
      positioning={{ sameWidth: false, placement: "bottom-start" }}
    >
      <ChakraCombobox.Control>
        <ChakraCombobox.Input placeholder="Type to search" />
        <ChakraCombobox.IndicatorGroup>
          <ChakraCombobox.ClearTrigger  />
        </ChakraCombobox.IndicatorGroup>
      </ChakraCombobox.Control>

      <Portal>
        <ChakraCombobox.Positioner>
          <ChakraCombobox.Content minW="sm">
              {
              collection.items?.map((item) => (
                <ChakraCombobox.Item key={item.value} item={item}>
                  <HStack justify="space-between" textStyle="sm">
                    <Span fontWeight="medium" truncate>
                      {item.label}
                    </Span>
                  </HStack>
                  <ChakraCombobox.ItemIndicator />
                </ChakraCombobox.Item>
              ))}
          </ChakraCombobox.Content>
        </ChakraCombobox.Positioner>
      </Portal>
    </ChakraCombobox.Root>
  )
}
