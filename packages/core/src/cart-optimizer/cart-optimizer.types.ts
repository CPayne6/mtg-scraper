import type { CardWithStore, Condition } from '@scoutlgs/shared';

export type ConditionFlexibilityMode =
  | 'strict'
  | 'allow-if-needed'
  | 'allow-if-cheaper';

export type ConditionValueMode = 'off' | 'prefer-higher-condition';

export type SetPreferenceMode = 'any' | 'preferred' | 'required';

export interface CartOptimizationWantedCard {
  /**
   * Stable caller-owned key for this wanted card entry. For saved lists this can
   * be the list entry id/position or cardNameId, depending on how candidates are
   * grouped by the caller.
   */
  key: string;
  name: string;
  quantity?: number;
  minimumCondition?: Condition;
  preferredSetCode?: string;
  setPreference?: SetPreferenceMode;
  setMismatchPenalty?: number;
}

export interface CartOptimizationCandidate {
  wantedCardKey: string;
  offer: CardWithStore;
  setCode?: string;
  setName?: string;
  /**
   * Optional inventory available for this exact offer. If omitted, the optimizer
   * treats the offer as reusable, which matches the current shared CardWithStore
   * shape where quantity is not present.
   */
  availableQuantity?: number;
}

export interface ConditionFlexibilityOptions {
  mode: ConditionFlexibilityMode;
  maxDowngradeSteps?: number;
  downgradePenaltyPerStep?: number;
  downgradePenaltyByStep?: Record<number, number>;
}

export interface ConditionValueOptions {
  mode: ConditionValueMode;
  /**
   * Only apply the preference when the higher-condition copy is at least this
   * expensive. This keeps low-cost cards price-first.
   */
  minimumHigherConditionPrice?: number;
  /**
   * Optional lower bound for the upgrade premium. Use this for experiments
   * where tiny price differences should still be decided by raw price.
   */
  minUpgradePremium?: number;
  /**
   * Maximum price premium where the higher-condition copy should be preferred.
   */
  maxUpgradePremium?: number;
}

export interface CartOptimizationOptions {
  defaultMinimumCondition?: Condition;
  defaultShippingCost?: number;
  shippingCostByStoreKey?: Record<string, number>;
  conditionFlexibility?: ConditionFlexibilityOptions;
  conditionValue?: ConditionValueOptions;
  maxCandidatesPerWantedCard?: number;
  maxResults?: number;
}

export interface OptimizeCartInput {
  wantedCards: CartOptimizationWantedCard[];
  candidates: CartOptimizationCandidate[];
  options?: CartOptimizationOptions;
}

export interface SelectedCartOffer {
  wantedCardKey: string;
  wantedCardName: string;
  offer: CardWithStore;
  storeKey: string;
  storeName: string;
  price: number;
  minimumCondition: Condition;
  condition: Condition;
  meetsMinimumCondition: boolean;
  conditionDowngradeSteps: number;
  conditionPenalty: number;
  conditionValuePenalty: number;
  setCode?: string;
  setName?: string;
  preferredSetCode?: string;
  meetsSetPreference: boolean;
  setPreferencePenalty: number;
}

export interface StoreCartPlan {
  storeKey: string;
  storeName: string;
  shippingCost: number;
  subtotal: number;
  estimatedTotal: number;
  items: SelectedCartOffer[];
}

export type MissingWantedCardReason =
  | 'no-candidates'
  | 'below-minimum-only'
  | 'set-mismatch-only'
  | 'invalid-candidates'
  | 'capacity-exhausted';

export interface MissingWantedCard {
  wantedCardKey: string;
  wantedCardName: string;
  minimumCondition: Condition;
  reason: MissingWantedCardReason;
  bestRejectedOffer?: CardWithStore;
}

export interface CartOptimizationTotals {
  subtotal: number;
  shipping: number;
  estimatedTotal: number;
  conditionPenalty: number;
  conditionValuePenalty: number;
  setPreferencePenalty: number;
  objectiveTotal: number;
}

export interface CartOptimizationResult {
  status: 'complete' | 'partial' | 'empty';
  selectedOffers: SelectedCartOffer[];
  stores: StoreCartPlan[];
  missingCards: MissingWantedCard[];
  totals: CartOptimizationTotals;
}
