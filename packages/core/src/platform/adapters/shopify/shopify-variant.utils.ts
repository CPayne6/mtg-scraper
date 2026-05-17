import { Condition } from '@scoutlgs/shared';

/**
 * Minimal variant shape needed for condition/foil parsing.
 * Accepts Shopify REST variants, Storefront API variants, or any object
 * with the relevant option fields.
 */
export interface VariantConditionInput {
  option1?: string;
  option2?: string;
  title?: string;
}

/**
 * Parse condition and foil status from a Shopify-style variant.
 *
 * Condition is derived from option1 (falling back to title), matching:
 *   NM / Near Mint, LP / PL / Lightly Played / SP / Slightly Played,
 *   MP / Moderately Played, HP / Heavily Played, DMG / Damaged.
 *
 * Foil is detected from the combined option1+option2+title string,
 * excluding "non-foil" variants.
 */
export function parseConditionAndFoil(variant: VariantConditionInput): {
  condition: Condition;
  foil: boolean;
} {
  const conditionStr = variant.option1 || variant.title || '';
  const foilStr = variant.option2 || variant.title || '';
  const fullStr = `${conditionStr} ${foilStr}`.toLowerCase();

  let condition = Condition.UNKNOWN;
  if (/\b(nm|near\s*mint)\b/i.test(conditionStr)) {
    condition = Condition.NM;
  } else if (/\b(lp|pl|light(ly)?\s*played|sp|slight(ly)?\s*played)\b/i.test(conditionStr)) {
    condition = Condition.LP;
  } else if (/\b(mp|moderate(ly)?\s*played)\b/i.test(conditionStr)) {
    condition = Condition.MP;
  } else if (/\b(hp|heavy|heavily\s*played)\b/i.test(conditionStr)) {
    condition = Condition.HP;
  } else if (/\b(dmg|damaged)\b/i.test(conditionStr)) {
    condition = Condition.DMG;
  }

  const foil = /\bfoil\b/i.test(fullStr) && !/\bnon[- ]?foil\b/i.test(fullStr);

  return { condition, foil };
}
