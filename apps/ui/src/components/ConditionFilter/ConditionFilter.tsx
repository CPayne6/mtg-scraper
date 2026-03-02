import { useMemo, useState } from 'react'
import { Box, Button, Checkbox, Collapse, FormControl, FormControlLabel, FormGroup, FormLabel, IconButton, Typography } from '@mui/material'
import ExpandLess from '@mui/icons-material/ExpandLess'
import ExpandMore from '@mui/icons-material/ExpandMore'

export interface ConditionCountEntry {
  code: string;
  displayName: string;
  count: number;
  sortOrder: number;
}

interface ConditionFilterProps {
  conditionCounts: ConditionCountEntry[];
  selectedConditions: string[];
  onConditionsChange: (codes: string[]) => void;
}

const STORAGE_KEY = 'condition-filter-expanded';

export function ConditionFilter({ conditionCounts, selectedConditions, onConditionsChange }: ConditionFilterProps) {
  const [expanded, setExpanded] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored !== null ? JSON.parse(stored) : true;
    } catch {
      return true;
    }
  });

  const handleToggleExpanded = () => {
    const newExpanded = !expanded;
    setExpanded(newExpanded);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newExpanded));
  };

  const handleToggleCondition = (code: string) => {
    if (selectedConditions.includes(code)) {
      onConditionsChange(selectedConditions.filter(c => c !== code));
    } else {
      onConditionsChange([...selectedConditions, code]);
    }
  };

  const handleClearAll = () => {
    onConditionsChange([]);
  };

  const totalCount = useMemo(
    () => conditionCounts.reduce((sum, c) => sum + c.count, 0),
    [conditionCounts]
  );

  const selectedCount = useMemo(
    () => selectedConditions.length === 0
      ? totalCount
      : conditionCounts
          .filter(c => selectedConditions.includes(c.code))
          .reduce((sum, c) => sum + c.count, 0),
    [conditionCounts, selectedConditions, totalCount]
  );

  const displayText = useMemo(
    () => selectedConditions.length === 0
      ? 'All Conditions'
      : `${selectedConditions.length} condition${selectedConditions.length !== 1 ? 's' : ''}`,
    [selectedConditions.length]
  );

  const hasConditions = conditionCounts.length > 0;

  return (
    <Box
      sx={{
        p: 2,
        bgcolor: 'background.paper',
        borderRadius: 2,
        boxShadow: 1,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: hasConditions ? 'pointer' : 'default',
        }}
        onClick={hasConditions ? handleToggleExpanded : undefined}
      >
        <Box>
          <FormLabel
            component="legend"
            sx={{
              fontWeight: 600,
              fontSize: '1rem',
              color: 'text.primary',
              cursor: hasConditions ? 'pointer' : 'default',
            }}
          >
            Filter by Condition
          </FormLabel>
          <Typography variant="caption" color="text.secondary">
            {hasConditions ? `${displayText} (${selectedCount} cards)` : 'No conditions available'}
          </Typography>
        </Box>
        {hasConditions && (
          <IconButton size="small">
            {expanded ? <ExpandLess /> : <ExpandMore />}
          </IconButton>
        )}
      </Box>

      {hasConditions && (
        <Collapse in={expanded}>
          <FormControl component="fieldset" fullWidth sx={{ mt: 2 }}>
            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
              <Button size="small" onClick={handleClearAll} disabled={selectedConditions.length === 0}>
                Clear
              </Button>
            </Box>

            <FormGroup>
              {conditionCounts.map((condition) => {
                const isSelected = selectedConditions.length > 0 && selectedConditions.includes(condition.code);
                return (
                  <FormControlLabel
                    key={condition.code}
                    control={
                      <Checkbox
                        checked={isSelected}
                        onChange={() => handleToggleCondition(condition.code)}
                      />
                    }
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2">{condition.displayName}</Typography>
                        <Typography
                          variant="caption"
                          sx={{
                            bgcolor: 'primary.main',
                            color: 'primary.contrastText',
                            px: 1,
                            py: 0.25,
                            borderRadius: 1,
                            fontWeight: 600,
                          }}
                        >
                          {condition.count}
                        </Typography>
                      </Box>
                    }
                  />
                );
              })}
            </FormGroup>
          </FormControl>
        </Collapse>
      )}
    </Box>
  );
}
