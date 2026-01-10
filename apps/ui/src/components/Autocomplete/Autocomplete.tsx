import React, { useEffect, useState } from "react";
import MuiAutocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';

type AutocompleteProps = {
  options: string[];
  value?: string;
  onChange?: (value: string) => void;
  onSuggestionSelect?: (value: string) => void;
  placeholder?: string;
  isDisabled?: boolean;
  size?: "small" | "medium";
};

export default function Autocomplete({
  options,
  value,
  onChange,
  onSuggestionSelect,
  placeholder = "Start typing...",
  isDisabled = false,
  size = "medium"
}: AutocompleteProps) {
  const [inputValue, setInputValue] = useState<string>(value ?? "");
  const [selectedValue, setSelectedValue] = useState<string | null>(value ?? null);

  // Keep local state in sync with controlled value (if provided)
  useEffect(() => {
    if (typeof value === "string" && value !== inputValue) {
      setInputValue(value);
      setSelectedValue(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleInputChange = (_event: React.SyntheticEvent, newInputValue: string) => {
    setInputValue(newInputValue);
    onChange?.(newInputValue);
  };

  const handleChange = (_event: React.SyntheticEvent, newValue: string | null) => {
    setSelectedValue(newValue);
    if (newValue) {
      setInputValue(newValue);
      onChange?.(newValue);
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
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder={placeholder}
          variant="outlined"
        />
      )}
      sx={{ width: '100%' }}
    />
  );
}
