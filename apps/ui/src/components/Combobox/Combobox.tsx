"use client"

import MuiAutocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import { useEffect, useState } from "react"

interface ComboboxProps {
  value: string;
  selectedOption?: string;
  options: string[]
  onChange?: (value: string) => void;
  onSuggestionSelect?: (value: string) => void;
  placeholder?: string;
  isDisabled?: boolean;
  size?: "small" | "medium";
}

export const Combobox = ({
  value,
  selectedOption,
  options,
  onChange,
  onSuggestionSelect,
  placeholder = "Start typing...",
  isDisabled = false,
  size = "medium"
}: ComboboxProps) => {
  const [inputValue, setInputValue] = useState<string>(value);
  const [selectedValue, setSelectedValue] = useState<string | null>(selectedOption ?? null);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    if (selectedOption !== undefined) {
      setSelectedValue(selectedOption);
    }
  }, [selectedOption]);

  const handleInputChange = (_event: React.SyntheticEvent, newInputValue: string) => {
    setInputValue(newInputValue);
    onChange?.(newInputValue);
  };

  const handleChange = (_event: React.SyntheticEvent, newValue: string | null) => {
    setSelectedValue(newValue);
    if (newValue) {
      onSuggestionSelect?.(newValue);
    }
  };

  return (
    <MuiAutocomplete
      freeSolo
      options={options}
      value={selectedValue}
      inputValue={inputValue}
      onInputChange={handleInputChange}
      onChange={handleChange}
      disabled={isDisabled}
      size={size}
      autoHighlight
      selectOnFocus
      clearOnBlur
      handleHomeEndKeys
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder={placeholder}
          variant="outlined"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && options.length > 0 && !selectedValue) {
              e.preventDefault();
              const firstOption = options[0];
              setSelectedValue(firstOption);
              onSuggestionSelect?.(firstOption);
            }
          }}
        />
      )}
      sx={{ width: '320px' }}
    />
  )
}
