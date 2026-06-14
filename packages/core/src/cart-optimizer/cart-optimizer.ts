import { Condition } from '@scoutlgs/shared';
import type {
  CartOptimizationCandidate,
  CartOptimizationOptions,
  CartOptimizationResult,
  CartOptimizationWantedCard,
  ConditionFlexibilityOptions,
  ConditionValueOptions,
  MissingWantedCard,
  OptimizeCartInput,
  SelectedCartOffer,
  SetPreferenceMode,
  StoreCartPlan,
} from './cart-optimizer.types';

const DEFAULT_SHIPPING_COST = 3;
const DEFAULT_MINIMUM_CONDITION = Condition.DMG;
const DEFAULT_MAX_RESULTS = 1;
const MISSING_CARD_SEARCH_PENALTY = 1_000_000_000_000;
const DEFAULT_MINIMUM_HIGHER_CONDITION_PRICE = 50;
const DEFAULT_MIN_UPGRADE_PREMIUM = 10;
const DEFAULT_MAX_UPGRADE_PREMIUM = 30;

const CONDITION_RANK: Record<Condition, number> = {
  [Condition.NM]: 5,
  [Condition.LP]: 4,
  [Condition.MP]: 3,
  [Condition.HP]: 2,
  [Condition.DMG]: 1,
  [Condition.UNKNOWN]: 0,
};

interface ExpandedWantedCard extends CartOptimizationWantedCard {
  expandedKey: string;
  order: number;
  minimumCondition: Condition;
}

interface CandidateEvaluation {
  wantedCardKey: string;
  wantedCardName: string;
  wantedOrder: number;
  candidateKey: string;
  offer: CartOptimizationCandidate['offer'];
  availableQuantity: number;
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
  setPreference: SetPreferenceMode;
  meetsSetPreference: boolean;
  setPreferencePenalty: number;
  effectiveCost: number;
}

interface CandidateGroup {
  wanted: ExpandedWantedCard;
  candidates: CandidateEvaluation[];
  rejectedBelowMinimum: CandidateEvaluation[];
  rejectedSetMismatch: CandidateEvaluation[];
  invalidCandidates: number;
}

interface MissingSelection {
  missing: true;
  group: CandidateGroup;
}

type SearchSelection = CandidateEvaluation | MissingSelection;

interface SearchState {
  groupIndex: number;
  cost: number;
  selected: SearchSelection[];
  usedStores: Set<string>;
  usedCandidateCounts: Map<string, number>;
}

interface SearchResult {
  cost: number;
  selected: SearchSelection[];
  key: string;
}

export function optimizeCart(input: OptimizeCartInput): CartOptimizationResult {
  return optimizeCartOptions({
    ...input,
    options: {
      ...input.options,
      maxResults: 1,
    },
  })[0] ?? buildResult([], input.options ?? {});
}

export function optimizeCartOptions(input: OptimizeCartInput): CartOptimizationResult[] {
  const options = input.options ?? {};
  const maxResults = normalizeMaxResults(options.maxResults);
  const groups = buildCandidateGroups(input.wantedCards, input.candidates, options);

  if (groups.length === 0) {
    return [buildResult([], options)];
  }

  groups.sort((a, b) => {
    const countDiff = a.candidates.length - b.candidates.length;
    if (countDiff !== 0) return countDiff;
    return cheapestEffectiveCost(a) - cheapestEffectiveCost(b);
  });

  const suffixLowerBounds = buildSuffixLowerBounds(groups);
  const bestResults: SearchResult[] = [];
  const seenResultKeys = new Set<string>();

  const search = (state: SearchState): void => {
    if (state.groupIndex === groups.length) {
      addSearchResult(bestResults, seenResultKeys, {
        cost: state.cost,
        selected: [...state.selected],
        key: searchResultKey(state.selected),
      }, maxResults);
      return;
    }

    if (cannotBeatCurrentResults(state.cost + suffixLowerBounds[state.groupIndex], bestResults, maxResults)) {
      return;
    }

    const group = groups[state.groupIndex];
    const orderedCandidates = orderCandidatesForState(group.candidates, state.usedStores, options);

    for (const candidate of orderedCandidates) {
      const usedCount = state.usedCandidateCounts.get(candidate.candidateKey) ?? 0;
      if (usedCount >= candidate.availableQuantity) continue;

      const shippingDelta = state.usedStores.has(candidate.storeKey)
        ? 0
        : shippingCostForStore(candidate.storeKey, options);
      const nextCost = state.cost + candidate.effectiveCost + shippingDelta;

      if (cannotBeatCurrentResults(nextCost + suffixLowerBounds[state.groupIndex + 1], bestResults, maxResults)) {
        continue;
      }

      const nextUsedStores = new Set(state.usedStores);
      nextUsedStores.add(candidate.storeKey);

      const nextUsedCandidateCounts = new Map(state.usedCandidateCounts);
      nextUsedCandidateCounts.set(candidate.candidateKey, usedCount + 1);

      search({
        groupIndex: state.groupIndex + 1,
        cost: nextCost,
        selected: [...state.selected, candidate],
        usedStores: nextUsedStores,
        usedCandidateCounts: nextUsedCandidateCounts,
      });
    }

    const missingCost = state.cost + MISSING_CARD_SEARCH_PENALTY;
    if (!cannotBeatCurrentResults(missingCost + suffixLowerBounds[state.groupIndex + 1], bestResults, maxResults)) {
      search({
        groupIndex: state.groupIndex + 1,
        cost: missingCost,
        selected: [...state.selected, { missing: true, group }],
        usedStores: state.usedStores,
        usedCandidateCounts: state.usedCandidateCounts,
      });
    }
  };

  search({
    groupIndex: 0,
    cost: 0,
    selected: [],
    usedStores: new Set(),
    usedCandidateCounts: new Map(),
  });

  return keepBestStatusResults(
    bestResults.map((result) => buildResult(result.selected, options)),
  );
}

export function normalizeCondition(condition: Condition | string | null | undefined): Condition {
  const normalized = String(condition ?? '').trim().toLowerCase();
  switch (normalized) {
    case Condition.NM:
      return Condition.NM;
    case Condition.LP:
      return Condition.LP;
    case Condition.MP:
      return Condition.MP;
    case Condition.HP:
      return Condition.HP;
    case Condition.DMG:
      return Condition.DMG;
    default:
      return Condition.UNKNOWN;
  }
}

export function conditionDowngradeSteps(
  minimumCondition: Condition,
  offeredCondition: Condition,
): number {
  return Math.max(0, CONDITION_RANK[minimumCondition] - CONDITION_RANK[offeredCondition]);
}

export function isConditionAtLeast(
  offeredCondition: Condition,
  minimumCondition: Condition,
): boolean {
  return conditionDowngradeSteps(minimumCondition, offeredCondition) === 0;
}

function buildCandidateGroups(
  wantedCards: CartOptimizationWantedCard[],
  candidates: CartOptimizationCandidate[],
  options: CartOptimizationOptions,
): CandidateGroup[] {
  const candidatesByWantedKey = new Map<string, CartOptimizationCandidate[]>();
  for (const candidate of candidates) {
    const existing = candidatesByWantedKey.get(candidate.wantedCardKey) ?? [];
    existing.push(candidate);
    candidatesByWantedKey.set(candidate.wantedCardKey, existing);
  }

  return expandWantedCards(wantedCards, options).map((wanted) => {
    const rawCandidates = candidatesByWantedKey.get(wanted.key) ?? [];
    const evaluated = rawCandidates
      .map((candidate) => evaluateCandidate(wanted, candidate, options))
      .filter((candidate): candidate is CandidateEvaluation => candidate !== null);
    const invalidCandidates = rawCandidates.length - evaluated.length;
    const rejectedBelowMinimum = evaluated.filter(
      (candidate) => !candidate.meetsMinimumCondition,
    );
    const setFiltered = applySetPreference(evaluated);
    const rejectedSetMismatch = evaluated.filter(
      (candidate) => candidate.setPreference === 'required' && !candidate.meetsSetPreference,
    );
    const candidatesForMode = applyConditionFlexibility(
      setFiltered,
      options.conditionFlexibility,
    );
    const valueAdjustedCandidates = applyConditionValuePolicy(
      candidatesForMode,
      options.conditionValue,
    );

    return {
      wanted,
      candidates: limitCandidates(valueAdjustedCandidates, options.maxCandidatesPerWantedCard),
      rejectedBelowMinimum,
      rejectedSetMismatch,
      invalidCandidates,
    };
  });
}

function expandWantedCards(
  wantedCards: CartOptimizationWantedCard[],
  options: CartOptimizationOptions,
): ExpandedWantedCard[] {
  const expanded: ExpandedWantedCard[] = [];
  for (const [wantedIndex, wanted] of wantedCards.entries()) {
    const quantity = normalizeQuantity(wanted.quantity);
    for (let index = 0; index < quantity; index += 1) {
      expanded.push({
        ...wanted,
        expandedKey: quantity === 1 ? wanted.key : `${wanted.key}:${index + 1}`,
        order: wantedIndex + index / quantity,
        minimumCondition: normalizeCondition(
          wanted.minimumCondition ?? options.defaultMinimumCondition ?? DEFAULT_MINIMUM_CONDITION,
        ),
      });
    }
  }
  return expanded;
}

function normalizeQuantity(quantity: number | undefined): number {
  if (quantity == null) return 1;
  if (!Number.isFinite(quantity) || quantity < 1) return 1;
  return Math.floor(quantity);
}

function normalizeMaxResults(maxResults: number | undefined): number {
  if (maxResults == null) return DEFAULT_MAX_RESULTS;
  if (!Number.isFinite(maxResults) || maxResults < 1) return DEFAULT_MAX_RESULTS;
  return Math.floor(maxResults);
}

function normalizeSetCode(setCode: string | null | undefined): string | undefined {
  const normalized = setCode?.trim().toLowerCase();
  return normalized || undefined;
}

function normalizeSetPreference(
  setPreference: SetPreferenceMode | undefined,
  preferredSetCode: string | undefined,
): SetPreferenceMode {
  if (!preferredSetCode) return 'any';
  return setPreference ?? 'required';
}

function normalizePenalty(penalty: number | undefined): number {
  if (penalty == null) return 0;
  return Number.isFinite(penalty) && penalty > 0 ? penalty : 0;
}

function evaluateCandidate(
  wanted: ExpandedWantedCard,
  candidate: CartOptimizationCandidate,
  options: CartOptimizationOptions,
): CandidateEvaluation | null {
  const price = Number(candidate.offer.price);
  const storeKey = candidate.offer.store_key?.trim();
  const storeName = candidate.offer.store?.trim() || storeKey;

  if (!Number.isFinite(price) || price < 0 || !storeKey) {
    return null;
  }

  const condition = normalizeCondition(candidate.offer.condition);
  const downgradeSteps = conditionDowngradeSteps(wanted.minimumCondition, condition);
  const meetsMinimumCondition = downgradeSteps === 0;
  const conditionPenalty = meetsMinimumCondition
    ? 0
    : calculateConditionPenalty(downgradeSteps, options.conditionFlexibility);
  const setCode = normalizeSetCode(candidate.setCode);
  const setName = candidate.setName;
  const preferredSetCode = normalizeSetCode(wanted.preferredSetCode);
  const setPreference = normalizeSetPreference(wanted.setPreference, preferredSetCode);
  const meetsSetPreference =
    setPreference === 'any' ||
    (preferredSetCode != null && setCode === preferredSetCode);
  const setPreferencePenalty =
    setPreference === 'preferred' && !meetsSetPreference
      ? normalizePenalty(wanted.setMismatchPenalty)
      : 0;

  return {
    wantedCardKey: wanted.expandedKey,
    wantedCardName: wanted.name,
    wantedOrder: wanted.order,
    candidateKey: candidateKey(candidate),
    offer: candidate.offer,
    availableQuantity: normalizeAvailableQuantity(candidate.availableQuantity),
    storeKey,
    storeName,
    price,
    minimumCondition: wanted.minimumCondition,
    condition,
    meetsMinimumCondition,
    conditionDowngradeSteps: downgradeSteps,
    conditionPenalty,
    conditionValuePenalty: 0,
    setCode,
    setName,
    preferredSetCode,
    setPreference,
    meetsSetPreference,
    setPreferencePenalty,
    effectiveCost: price + conditionPenalty + setPreferencePenalty,
  };
}

function normalizeAvailableQuantity(quantity: number | undefined): number {
  if (quantity == null) return Number.POSITIVE_INFINITY;
  if (!Number.isFinite(quantity) || quantity < 1) return 0;
  return Math.floor(quantity);
}

function candidateKey(candidate: CartOptimizationCandidate): string {
  const offer = candidate.offer;
  return [
    offer.id ?? '',
    offer.variant_id ?? '',
    offer.store_key,
    offer.set,
    offer.card_number,
    offer.condition,
    offer.foil ? 'foil' : 'nonfoil',
    offer.price,
    candidate.setCode ?? '',
    offer.link,
  ].join('|');
}

function calculateConditionPenalty(
  downgradeSteps: number,
  flexibility: ConditionFlexibilityOptions | undefined,
): number {
  if (downgradeSteps <= 0) return 0;
  const byStep = flexibility?.downgradePenaltyByStep?.[downgradeSteps];
  if (byStep != null) return byStep;
  return downgradeSteps * (flexibility?.downgradePenaltyPerStep ?? 0);
}

function applyConditionFlexibility(
  candidates: CandidateEvaluation[],
  flexibility: ConditionFlexibilityOptions | undefined,
): CandidateEvaluation[] {
  const mode = flexibility?.mode ?? 'strict';
  const maxDowngradeSteps = flexibility?.maxDowngradeSteps ?? Number.POSITIVE_INFINITY;
  const strictCandidates = candidates.filter((candidate) => candidate.meetsMinimumCondition);
  const flexibleCandidates = candidates.filter(
    (candidate) =>
      !candidate.meetsMinimumCondition &&
      candidate.conditionDowngradeSteps <= maxDowngradeSteps,
  );

  if (mode === 'strict') return strictCandidates;
  if (mode === 'allow-if-needed') {
    return strictCandidates.length > 0 ? strictCandidates : flexibleCandidates;
  }

  return [...strictCandidates, ...flexibleCandidates];
}

function applySetPreference(candidates: CandidateEvaluation[]): CandidateEvaluation[] {
  return candidates.filter(
    (candidate) =>
      candidate.setPreference !== 'required' || candidate.meetsSetPreference,
  );
}

function applyConditionValuePolicy(
  candidates: CandidateEvaluation[],
  conditionValue: ConditionValueOptions | undefined,
): CandidateEvaluation[] {
  if (!conditionValue || conditionValue.mode === 'off' || candidates.length < 2) {
    return candidates;
  }

  const minimumHigherConditionPrice =
    conditionValue.minimumHigherConditionPrice ?? DEFAULT_MINIMUM_HIGHER_CONDITION_PRICE;
  const minUpgradePremium =
    conditionValue.minUpgradePremium ?? DEFAULT_MIN_UPGRADE_PREMIUM;
  const maxUpgradePremium =
    conditionValue.maxUpgradePremium ?? DEFAULT_MAX_UPGRADE_PREMIUM;

  return candidates.map((candidate) => {
    let conditionValuePenalty = 0;

    for (const higherConditionCandidate of candidates) {
      if (
        CONDITION_RANK[higherConditionCandidate.condition] <=
        CONDITION_RANK[candidate.condition]
      ) {
        continue;
      }

      if (higherConditionCandidate.price < minimumHigherConditionPrice) {
        continue;
      }

      const upgradePremium = higherConditionCandidate.price - candidate.price;
      if (
        upgradePremium < minUpgradePremium ||
        upgradePremium > maxUpgradePremium
      ) {
        continue;
      }

      const penaltyNeeded =
        higherConditionCandidate.effectiveCost -
        (candidate.effectiveCost + conditionValuePenalty) +
        0.01;
      conditionValuePenalty += Math.max(0, penaltyNeeded);
    }

    if (conditionValuePenalty === 0) {
      return candidate;
    }

    return {
      ...candidate,
      conditionValuePenalty,
      effectiveCost: candidate.effectiveCost + conditionValuePenalty,
    };
  });
}

function limitCandidates(
  candidates: CandidateEvaluation[],
  maxCandidates: number | undefined,
): CandidateEvaluation[] {
  const ordered = [...candidates].sort(compareCandidatesByEffectiveCost);
  if (!maxCandidates || maxCandidates <= 0 || ordered.length <= maxCandidates) {
    return ordered;
  }
  return ordered.slice(0, Math.floor(maxCandidates));
}

function compareCandidatesByEffectiveCost(
  a: CandidateEvaluation,
  b: CandidateEvaluation,
): number {
  return (
    a.effectiveCost - b.effectiveCost ||
    a.price - b.price ||
    a.conditionDowngradeSteps - b.conditionDowngradeSteps ||
    a.storeName.localeCompare(b.storeName)
  );
}

function buildMissingWantedCard(group: CandidateGroup): MissingWantedCard {
  const bestRejected = [
    ...group.rejectedBelowMinimum,
    ...group.rejectedSetMismatch,
  ].sort(compareCandidatesByEffectiveCost)[0];
  const reason =
    group.candidates.length > 0
      ? 'capacity-exhausted'
      : group.rejectedSetMismatch.length > 0
        ? 'set-mismatch-only'
      : group.rejectedBelowMinimum.length > 0
      ? 'below-minimum-only'
      : group.invalidCandidates > 0
        ? 'invalid-candidates'
        : 'no-candidates';

  return {
    wantedCardKey: group.wanted.expandedKey,
    wantedCardName: group.wanted.name,
    minimumCondition: group.wanted.minimumCondition,
    reason,
    bestRejectedOffer: bestRejected?.offer,
  };
}

function cheapestEffectiveCost(group: CandidateGroup): number {
  const cheapestCandidateCost = group.candidates.reduce(
    (best, candidate) => Math.min(best, candidate.effectiveCost),
    Number.POSITIVE_INFINITY,
  );
  return Math.min(cheapestCandidateCost, MISSING_CARD_SEARCH_PENALTY);
}

function buildSuffixLowerBounds(groups: CandidateGroup[]): number[] {
  const lowerBounds = new Array<number>(groups.length + 1).fill(0);
  for (let index = groups.length - 1; index >= 0; index -= 1) {
    lowerBounds[index] = lowerBounds[index + 1] + cheapestEffectiveCost(groups[index]);
  }
  return lowerBounds;
}

function addSearchResult(
  bestResults: SearchResult[],
  seenResultKeys: Set<string>,
  result: SearchResult,
  maxResults: number,
): void {
  if (seenResultKeys.has(result.key)) return;

  seenResultKeys.add(result.key);
  bestResults.push(result);
  bestResults.sort((a, b) => a.cost - b.cost || a.key.localeCompare(b.key));

  while (bestResults.length > maxResults) {
    const removed = bestResults.pop();
    if (removed) seenResultKeys.delete(removed.key);
  }
}

function cannotBeatCurrentResults(
  lowerBound: number,
  bestResults: SearchResult[],
  maxResults: number,
): boolean {
  if (bestResults.length < maxResults) return false;
  const worstBestCost = bestResults[bestResults.length - 1]?.cost ?? Number.POSITIVE_INFINITY;
  return lowerBound > worstBestCost;
}

function searchResultKey(selected: SearchSelection[]): string {
  return selected
    .map((selection) => {
      if (isMissingSelection(selection)) {
        return `${selection.group.wanted.expandedKey}:missing`;
      }
      return `${selection.wantedCardKey}:${selection.candidateKey}`;
    })
    .sort()
    .join('||');
}

function orderCandidatesForState(
  candidates: CandidateEvaluation[],
  usedStores: Set<string>,
  options: CartOptimizationOptions,
): CandidateEvaluation[] {
  return [...candidates].sort((a, b) => {
    const aShipping = usedStores.has(a.storeKey) ? 0 : shippingCostForStore(a.storeKey, options);
    const bShipping = usedStores.has(b.storeKey) ? 0 : shippingCostForStore(b.storeKey, options);
    return (
      a.effectiveCost + aShipping - (b.effectiveCost + bShipping) ||
      compareCandidatesByEffectiveCost(a, b)
    );
  });
}

function shippingCostForStore(
  storeKey: string,
  options: CartOptimizationOptions,
): number {
  const configured = options.shippingCostByStoreKey?.[storeKey] ?? options.defaultShippingCost;
  const shippingCost = configured ?? DEFAULT_SHIPPING_COST;
  return Number.isFinite(shippingCost) && shippingCost > 0 ? shippingCost : 0;
}

function buildResult(
  selected: SearchSelection[],
  options: CartOptimizationOptions,
): CartOptimizationResult {
  const selectedCandidates = selected.filter(isCandidateEvaluation);
  const missingCards = selected
    .filter(isMissingSelection)
    .sort((a, b) => a.group.wanted.order - b.group.wanted.order)
    .map((selection) => buildMissingWantedCard(selection.group));
  const selectedOffers = selectedCandidates
    .sort((a, b) => a.wantedOrder - b.wantedOrder)
    .map(toSelectedCartOffer);
  const stores = buildStorePlans(selectedOffers, options);
  const subtotal = roundMoney(selectedOffers.reduce((sum, item) => sum + item.price, 0));
  const shipping = roundMoney(stores.reduce((sum, store) => sum + store.shippingCost, 0));
  const conditionPenalty = roundMoney(
    selectedOffers.reduce((sum, item) => sum + item.conditionPenalty, 0),
  );
  const conditionValuePenalty = roundMoney(
    selectedOffers.reduce((sum, item) => sum + item.conditionValuePenalty, 0),
  );
  const setPreferencePenalty = roundMoney(
    selectedOffers.reduce((sum, item) => sum + item.setPreferencePenalty, 0),
  );
  const estimatedTotal = roundMoney(subtotal + shipping);
  const objectiveTotal = roundMoney(
    estimatedTotal + conditionPenalty + conditionValuePenalty + setPreferencePenalty,
  );
  const status =
    selectedOffers.length === 0
      ? 'empty'
      : missingCards.length > 0
        ? 'partial'
        : 'complete';

  return {
    status,
    selectedOffers,
    stores,
    missingCards,
    totals: {
      subtotal,
      shipping,
      estimatedTotal,
      conditionPenalty,
      conditionValuePenalty,
      setPreferencePenalty,
      objectiveTotal,
    },
  };
}

function keepBestStatusResults(results: CartOptimizationResult[]): CartOptimizationResult[] {
  if (results.some((result) => result.status === 'complete')) {
    return results.filter((result) => result.status === 'complete');
  }
  if (results.some((result) => result.status === 'partial')) {
    return results.filter((result) => result.status === 'partial');
  }
  return results;
}

function isCandidateEvaluation(selection: SearchSelection): selection is CandidateEvaluation {
  return !('missing' in selection);
}

function isMissingSelection(selection: SearchSelection): selection is MissingSelection {
  return 'missing' in selection;
}

function toSelectedCartOffer(candidate: CandidateEvaluation): SelectedCartOffer {
  return {
    wantedCardKey: candidate.wantedCardKey,
    wantedCardName: candidate.wantedCardName,
    offer: candidate.offer,
    storeKey: candidate.storeKey,
    storeName: candidate.storeName,
    price: candidate.price,
    minimumCondition: candidate.minimumCondition,
    condition: candidate.condition,
    meetsMinimumCondition: candidate.meetsMinimumCondition,
    conditionDowngradeSteps: candidate.conditionDowngradeSteps,
    conditionPenalty: candidate.conditionPenalty,
    conditionValuePenalty: candidate.conditionValuePenalty,
    setCode: candidate.setCode,
    setName: candidate.setName,
    preferredSetCode: candidate.preferredSetCode,
    meetsSetPreference: candidate.meetsSetPreference,
    setPreferencePenalty: candidate.setPreferencePenalty,
  };
}

function buildStorePlans(
  selectedOffers: SelectedCartOffer[],
  options: CartOptimizationOptions,
): StoreCartPlan[] {
  const storesByKey = new Map<string, StoreCartPlan>();

  for (const offer of selectedOffers) {
    const existing = storesByKey.get(offer.storeKey);
    if (existing) {
      existing.items.push(offer);
      existing.subtotal = roundMoney(existing.subtotal + offer.price);
      existing.estimatedTotal = roundMoney(existing.subtotal + existing.shippingCost);
      continue;
    }

    const shippingCost = shippingCostForStore(offer.storeKey, options);
    storesByKey.set(offer.storeKey, {
      storeKey: offer.storeKey,
      storeName: offer.storeName,
      shippingCost,
      subtotal: offer.price,
      estimatedTotal: roundMoney(offer.price + shippingCost),
      items: [offer],
    });
  }

  return [...storesByKey.values()].sort((a, b) => a.storeName.localeCompare(b.storeName));
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
