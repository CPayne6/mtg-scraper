
import React, { useState } from "react";
import { useDebounce } from "../../hooks";
import { HStack, Box, Spinner } from "@chakra-ui/react";
import { Combobox } from "../Combobox/Combobox";

type SkryfallAutocompleteProps = {
  placeholder?: string;
  debounceMs?: number;
  onSelect?: (name: string) => void;
  initialValue?: string;
  isDisabled?: boolean;
  size?: "sm" | "md" | "lg";
};

export default function SkryfallAutocomplete({
  placeholder = "Search cards...",
  debounceMs = 300,
  onSelect,
  initialValue = "",
  isDisabled = false,
  size = "md",
}: SkryfallAutocompleteProps) {
  const [options, setOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const [value, setValue] = useState<string>(initialValue);

  const fetchSuggestions = async (q: string, signal: AbortSignal) => {
    try {
      const res = await fetch(
        `https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(q)}`,
        { signal }
      );

      if (!res.ok) {
        console.error("Scryfall autocomplete error", res.statusText);
        return;
      }

      const data = await res.json();
      if (Array.isArray(data.data)) setOptions(data.data);
      else setOptions([]);
    } catch (err) {
      if ((err as any)?.name !== "AbortError") setOptions([]);
    } finally {
      setLoading(false);
    }
  };

  const { trigger, cancel } = useDebounce<string>(fetchSuggestions, debounceMs);

  const handleChange = (next: string) => {
    setValue(next);
    // cancel any pending debounced call
    cancel();

    // if empty, reset immediately
    if (!next || next.trim() === "") {
      setOptions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    trigger(next);
  };

  const handleSuggestionSelect = (v: string) => { 
    if (v.length === 0) return;
    onSelect?.(v);
    setValue(v);
  };

  return (
    <Box width="100%">
      <HStack align="center">
        <Box flex="1">
          <Combobox
            value={value} 
            selectedOption={initialValue}
            options={options}
            onChange={handleChange}
            onSuggestionSelect={handleSuggestionSelect}
            placeholder={placeholder}
            isDisabled={isDisabled}
            size={size}
          />
        </Box>
        <Spinner visibility={!loading ? "hidden" : "visible"} size="xs" color="gray.500" aria-label="loading" />
      </HStack>
    </Box>
  );
}
