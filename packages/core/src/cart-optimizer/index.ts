export {
  conditionDowngradeSteps,
  isConditionAtLeast,
  normalizeCondition,
  optimizeCart,
} from './cart-optimizer';
export type {
  CartOptimizationCandidate,
  CartOptimizationOptions,
  CartOptimizationResult,
  CartOptimizationTotals,
  CartOptimizationWantedCard,
  ConditionFlexibilityMode,
  ConditionFlexibilityOptions,
  MissingWantedCard,
  MissingWantedCardReason,
  OptimizeCartInput,
  SelectedCartOffer,
  StoreCartPlan,
} from './cart-optimizer.types';
