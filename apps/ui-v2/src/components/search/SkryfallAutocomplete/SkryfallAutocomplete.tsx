import { useEffect, useRef, useState } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import InputAdornment from '@mui/material/InputAdornment';
import { fetchScryfallAutocomplete } from '@/api/cards';
import type { ScryfallCardOption } from '@/api/cards';
import type { SkryfallAutocompleteProps } from './SkryfallAutocomplete.types';

export function SkryfallAutocomplete({
  value: controlledValue,
  placeholder = 'Search cards…',
  size = 'medium',
  autoFocus,
  onSelect,
  onSubmit,
}: SkryfallAutocompleteProps) {
  const [inputValue, setInputValue] = useState(controlledValue ?? '');
  const [options, setOptions] = useState<ScryfallCardOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (controlledValue !== undefined) setInputValue(controlledValue);
  }, [controlledValue]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const queryOptions = (q: string) => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();
    if (!q.trim()) {
      setOptions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    timerRef.current = window.setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const data = await fetchScryfallAutocomplete(q.trim(), controller.signal);
        if (controller.signal.aborted) return;
        setOptions(data);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setOptions([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);
  };

  return (
    <Autocomplete<ScryfallCardOption, false, false, true>
      freeSolo
      open={open && options.length > 0}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      size={size}
      options={options}
      getOptionLabel={(option) => typeof option === 'string' ? option : option.name}
      filterOptions={(x) => x}
      inputValue={inputValue}
      loading={loading}
      onInputChange={(_, next, reason) => {
        setInputValue(next);
        if (reason === 'input') queryOptions(next);
      }}
      onChange={(_, picked) => {
        if (picked && typeof picked !== 'string') {
          onSelect(picked);
        }
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder={placeholder}
          autoFocus={autoFocus}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && inputValue.trim()) {
              // Allow MUI to handle option selection if one is highlighted;
              // otherwise submit raw input.
              const target = e.target as HTMLInputElement;
              // If popup is open with options, MUI fires onChange via option select.
              // We only submit free-solo when nothing is currently highlighted.
              if (!target.getAttribute('aria-activedescendant')) {
                e.preventDefault();
                onSubmit?.(inputValue.trim());
              }
            }
          }}
          slotProps={{
            input: {
              ...params.InputProps,
              endAdornment: (
                <>
                  {loading ? (
                    <InputAdornment position="end" sx={{ mr: 0.5 }}>
                      <CircularProgress size={18} color="inherit" />
                    </InputAdornment>
                  ) : null}
                  {params.InputProps.endAdornment}
                </>
              ),
            },
          }}
          sx={
            size === 'small'
              ? {
                  '& .MuiOutlinedInput-root': { height: 36, fontSize: 14 },
                  '& .MuiOutlinedInput-input': { py: 0.75 },
                }
              : undefined
          }
        />
      )}
    />
  );
}
