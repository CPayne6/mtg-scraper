import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Input, InputGroup, IconButton, Select, createListCollection } from "@chakra-ui/react";
import { BsXLg as CloseIcon } from "react-icons/bs";
import { SelectDropdown } from "../Select/SelectDropdown";

type AutocompleteProps = {
  options: string[];
  value?: string;
  onChange?: (value: string) => void;
  onSuggestionSelect?: (value: string) => void;
  placeholder?: string;
  isDisabled?: boolean;
  size?: "sm" | "md" | "lg";
};

export default function Autocomplete({
  options,
  value,
  onChange,
  onSuggestionSelect,
  placeholder = "Start typing...",
  isDisabled = false,
  size = "md"
}: AutocompleteProps) {
  const [inputValue, setInputValue] = useState<string>(value ?? "");
  const [focused, setFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selectRef = useRef<HTMLSelectElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Keep local state in sync with controlled value (if provided)
  useEffect(() => {
    if (typeof value === "string" && value !== inputValue) {
      setInputValue(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Close suggestions when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);


  const filtered = useMemo(() => createListCollection({
    items: options.filter((option) => option.toLowerCase().includes(inputValue.toLowerCase()))
  }), [options, inputValue]);

  const showSelect = focused && (filtered.size > 0 || inputValue === "");

  const handleInputChange = (next: string) => {
    setInputValue(next);
    onChange?.(next);
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === "ArrowDown" && showSelect) {
      // focus the select so user can use keyboard to pick
      e.preventDefault();
      selectRef.current?.focus();
    } else if (e.key === "Escape") {
      setFocused(false);
    } else if (e.key === "Enter") {
      if (showSelect && filtered.size > 0) {
        // select the first option
        e.preventDefault();
        const firstOption = filtered.firstValue;
        handleInputChange(firstOption as string);
        onSuggestionSelect?.(firstOption as string);
        setFocused(false);
      }
    }
  };

  const handleClear = () => {
    setInputValue("");
    onChange?.("");
    // keep focus on the input so user can continue typing
    inputRef.current?.focus();
  };

  console.log("Rendering Autocomplete with options:", options, "and filtered:", filtered.items);

  return (
    <Box ref={containerRef} position="relative" width="100%">
      <InputGroup endElement={
        isDisabled && inputValue ? undefined :
          <IconButton
            size="sm"
            variant="ghost"
            aria-label="Clear"
            onClick={handleClear}
          >
            <CloseIcon />
          </IconButton>
      }>
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isDisabled}
          size={size}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={showSelect}
          aria-controls="autocomplete-select"
          pr={inputValue && !isDisabled ? "2.5rem" : undefined}
        />
      </InputGroup>

      {showSelect && (
        <Select.Root
          collection={filtered}
          open={true}
          id="autocomplete-select"
        >
          <Select.HiddenSelect />
          <SelectDropdown items={filtered.items.map((opt) => ({ label: opt, value: opt }))} />
        </Select.Root>
      )}
    </Box>
  );
}
