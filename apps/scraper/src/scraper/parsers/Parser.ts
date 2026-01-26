import { Logger } from '@nestjs/common';
import { Card, Condition } from '@scoutlgs/shared';

export interface Parser {
  extractItems(data: string): Promise<{ result: Card[]; error?: string }>;
}

const CONDITION_VALUES = new Set(Object.values(Condition));

export function parseCondition(value: string | undefined): Condition {
  if (!value) return Condition.UNKNOWN;
  const lower = value.toLowerCase();
  if (CONDITION_VALUES.has(lower as Condition)) {
    return lower as Condition;
  }
  return Condition.UNKNOWN;
}

export abstract class BaseParser implements Parser {
  protected readonly logger = new Logger(this.constructor.name);

  abstract extractItems(data: string): Promise<{ result: Card[]; error?: string }>;
}
