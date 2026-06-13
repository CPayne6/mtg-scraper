import { Condition } from '@scoutlgs/shared';
import type {
  CartOptimizationCandidate,
  CartOptimizationOptions,
  CartOptimizationResult,
  CartOptimizationWantedCard,
  ConditionFlexibilityOptions,
  MissingWantedCard,
  OptimizeCartInput,
  SelectedCartOffer,
  StoreCartPlan,
} from './cart-optimizer.types';

const DEFAULT_SHIPPING_COST = 3;
const DEFAULT_MINIMUM_CONDITION = Condition.DMG;
const MISSING_CARD_SEARCH_PENALTY = 1_000_000_000_000;

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
  effectiveCost: number;
}

interface CandidateGroup {
  wanted: ExpandedWantedCard;
  candidates: CandidateEvaluation[];
  rejectedBelowMinimum: CandidateEvaluation[];
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

export function optimizeCart(input: OptimizeCartInput): CartOptimizationResult {
  const options = input.options ?? {};
  const groups = buildCandidateGroups(input.wantedCards, input.candidates, options);

  if (groups.length === 0) {
    return buildResult([], options);
  }

  groups.sort((a, b) => {
    const countDiff = a.candidates.length - b.candidates.length;
    if (countDiff !== 0) return countDiff;
    return cheapestEffectiveCost(a) - cheapestEffectiveCost(b);
  });

  const suffixLowerBounds = buildSuffixLowerBounds(groups);
  let bestCost = Number.POSITIVE_INFINITY;
  let bestSelected: SearchSelection[] = [];

  const search = (state: SearchState): void => {
    if (state.groupIndex === groups.length) {
      if (state.cost < bestCost) {
        bestCost = state.cost;
        bestSelected = [...state.selected];
      }
      return;
    }

    if (state.cost + suffixLowerBounds[state.groupIndex] >= bestCost) {
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

      if (nextCost + suffixLowerBounds[state.groupIndex + 1] >= bestCost) {
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
    if (missingCost + suffixLowerBounds[state.groupIndex + 1] < bestCost) {
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

  return buildResult(bestSelected, options);
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
    const candidatesForMode = applyConditionFlexibility(evaluated, options.conditionFlexibility);

    return {
      wanted,
      candidates: limitCandidates(candidatesForMode, options.maxCandidatesPerWantedCard),
      rejectedBelowMinimum,
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

  return {
    wantedCardKey: wanted.expandedKey,
    wantedCardName: wanted.name,
    wantedOrder: wanted.order,
    candidateKey: candidateKey(wanted.key, candidate),
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
    effectiveCost: price + conditionPenalty,
  };
}

function normalizeAvailableQuantity(quantity: number | undefined): number {
  if (quantity == null) return Number.POSITIVE_INFINITY;
  if (!Number.isFinite(quantity) || quantity < 1) return 0;
  return Math.floor(quantity);
}

function candidateKey(
  wantedCardKey: string,
  candidate: CartOptimizationCandidate,
): string {
  const offer = candidate.offer;
  return [
    wantedCardKey,
    offer.id ?? '',
    offer.variant_id ?? '',
    offer.store_key,
    offer.set,
    offer.card_number,
    offer.condition,
    offer.foil ? 'foil' : 'nonfoil',
    offer.price,
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
  const bestRejected = [...group.rejectedBelowMinimum].sort(compareCandidatesByEffectiveCost)[0];
  const reason =
    group.candidates.length > 0
      ? 'capacity-exhausted'
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
  const estimatedTotal = roundMoney(subtotal + shipping);
  const objectiveTotal = roundMoney(estimatedTotal + conditionPenalty);
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
      objectiveTotal,
    },
  };
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
