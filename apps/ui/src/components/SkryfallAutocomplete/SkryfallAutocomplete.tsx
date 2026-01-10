import React, { useState } from "react";
import { useDebounce } from "../../hooks";
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import CircularProgress from '@mui/material/CircularProgress';
import { Combobox } from "../Combobox/Combobox";

type SkryfallAutocompleteProps = {
  placeholder?: string;
  debounceMs?: number;
  onSelect?: (name: string) => void;
  initialValue?: string;
  isDisabled?: boolean;
  size?: "small" | "medium";
};

export default function SkryfallAutocomplete({
  placeholder = "Search cards...",
  debounceMs = 300,
  onSelect,
  initialValue = "",
  isDisabled = false,
  size = "medium",
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
    <Box sx={{ width: '100%' }}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Box sx={{ flex: 1 }}>
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
        {loading && <CircularProgress size={20} sx={{ color: 'text.secondary' }} />}
      </Stack>
    </Box>
  );
}
