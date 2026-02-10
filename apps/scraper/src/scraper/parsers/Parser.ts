import { Logger } from '@nestjs/common';
import { Card, Condition } from '@scoutlgs/shared';

export interface Parser {
  extractItems(data: string): Promise<{ result: Card[]; error?: string }>;
}

export interface ParsedCondition {
  condition: Condition;
  foil: boolean;
}

const CONDITION_VALUES = new Set(Object.values(Condition));

// Map common abbreviations/initials to standard condition values
const CONDITION_ALIASES: Record<string, Condition> = {
  // Damaged
  d: Condition.DMG,
  damaged: Condition.DMG,
  // Slightly Played (401 Games uses SP)
  sp: Condition.LP,
  // Played (F2F uses PL)
  pl: Condition.LP,
};

// Foil indicator patterns (case-insensitive)
const FOIL_PATTERNS = [/\bfoil\b/i, /\bf\b$/]; // "foil" word or trailing "f" (e.g., "nmf")

/**
 * Parse condition string and extract both condition and foil status.
 * Handles formats like:
 * - "NM", "LP", "MP", "HP", "DMG"
 * - "Near Mint", "Lightly Played", etc.
 * - "Near Mint Foil", "NM Foil", "nmf"
 */
export function parseConditionWithFoil(value: string | undefined): ParsedCondition {
  if (!value) return { condition: Condition.UNKNOWN, foil: false };

  const original = value;
  const lower = value.toLowerCase().trim();

  // Check for foil indicators
  const foil = FOIL_PATTERNS.some((pattern) => pattern.test(original));

  // Remove foil indicators to get clean condition
  let cleanValue = lower
    .replace(/\bfoil\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Handle initials like "nmf" -> "nm"
  if (cleanValue.endsWith('f') && cleanValue.length <= 4) {
    cleanValue = cleanValue.slice(0, -1);
  }

  // Check if it's a known condition value
  if (CONDITION_VALUES.has(cleanValue as Condition)) {
    return { condition: cleanValue as Condition, foil };
  }

  // Check aliases
  if (CONDITION_ALIASES[cleanValue]) {
    return { condition: CONDITION_ALIASES[cleanValue], foil };
  }

  // Try extracting initials from full names like "Near Mint" -> "nm"
  const initials = cleanValue
    .match(/\b(\w)/g)
    ?.map((s) => s.toLowerCase())
    .join('');

  if (initials && CONDITION_VALUES.has(initials as Condition)) {
    return { condition: initials as Condition, foil };
  }

  if (initials && CONDITION_ALIASES[initials]) {
    return { condition: CONDITION_ALIASES[initials], foil };
  }

  return { condition: Condition.UNKNOWN, foil };
}

/**
 * @deprecated Use parseConditionWithFoil instead
 */
export function parseCondition(value: string | undefined): Condition {
  return parseConditionWithFoil(value).condition;
}

export abstract class BaseParser implements Parser {
  protected readonly logger = new Logger(this.constructor.name);

  abstract extractItems(data: string): Promise<{ result: Card[]; error?: string }>;
}
