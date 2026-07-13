import { Condition } from '@scoutlgs/shared';
import type {
  CartOptimizationCandidate,
  CartOptimizationOptions,
  CartOptimizationResult,
  CartOptimizationWantedCard,
  MissingWantedCard,
  OptimizeCartInput,
  SelectedCartOffer,
  StoreCartPlan,
} from './cart-optimizer.types';

const CONDITION_RANK: Record<Condition, number> = {
  [Condition.NM]: 5, [Condition.LP]: 4, [Condition.MP]: 3,
  [Condition.HP]: 2, [Condition.DMG]: 1, [Condition.UNKNOWN]: 0,
};
const DEFAULT_SHIPPING = 3;
const DEFAULT_BUDGET_MS = 60_000;

export function normalizeCondition(value: Condition | string | null | undefined): Condition {
  const normalized = String(value ?? '').trim().toLowerCase();
  return Object.values(Condition).includes(normalized as Condition)
    ? normalized as Condition : Condition.UNKNOWN;
}

export function conditionDowngradeSteps(minimum: Condition, offered: Condition): number {
  return Math.max(0, CONDITION_RANK[minimum] - CONDITION_RANK[offered]);
}

export function isConditionAtLeast(offered: Condition, minimum: Condition): boolean {
  return conditionDowngradeSteps(minimum, offered) === 0;
}

export function optimizeCart(input: OptimizeCartInput): CartOptimizationResult {
  const options = input.options ?? {};
  const now = options.now ?? Date.now;
  const deadline = now() + Math.max(0, options.timeBudgetMs ?? DEFAULT_BUDGET_MS);
  const wanted = expandWanted(input.wantedCards);
  const candidates = prepareCandidates(wanted, input.candidates, options);
  const stores = [...new Set(candidates.flatMap((group) => group.map((c) => c.storeKey)))].sort();
  const subsetCount = 2 ** stores.length;
  let best: SelectedCartOffer[] | undefined;
  let bestCost = Number.POSITIVE_INFINITY;
  let bestMissing = Number.POSITIVE_INFINITY;
  let subsetsEvaluated = 0;
  let optimal = true;

  for (let mask = 0; mask < subsetCount; mask += 1) {
    if (now() >= deadline) { optimal = false; break; }
    subsetsEvaluated += 1;
    const allowed = new Set(stores.filter((_, index) => (mask & (1 << index)) !== 0));
    const selected: SelectedCartOffer[] = [];
    let objective = 0;
    for (let index = 0; index < wanted.length; index += 1) {
      const choice = candidates[index]
        .filter((candidate) => allowed.has(candidate.storeKey))
        .sort((a, b) => effectiveCost(a) - effectiveCost(b) || a.price - b.price)[0];
      if (!choice) continue;
      selected.push(choice);
      objective += effectiveCost(choice);
    }
    const missing = wanted.length - selected.length;
    const usedStores = new Set(selected.map((item) => item.storeKey));
    for (const store of usedStores) objective += shippingFor(store, options);
    if (missing < bestMissing || (missing === bestMissing && objective < bestCost)) {
      bestMissing = missing; bestCost = objective; best = selected;
    }
  }

  return buildResult(wanted, candidates, input.candidates, best ?? [], options, optimal, subsetsEvaluated);
}

/** Kept as a compatibility shim; the asynchronous contract returns one cart. */
export function optimizeCartOptions(input: OptimizeCartInput): CartOptimizationResult[] {
  return [optimizeCart(input)];
}

function expandWanted(cards: CartOptimizationWantedCard[]): CartOptimizationWantedCard[] {
  return cards.flatMap((card) => Array.from({ length: Math.max(1, Math.floor(card.quantity ?? 1)) }, (_, i) => ({
    ...card, key: (card.quantity ?? 1) > 1 ? `${String(card.key)}:${i + 1}` : String(card.key),
  })));
}

function prepareCandidates(
  wanted: CartOptimizationWantedCard[],
  raw: CartOptimizationCandidate[],
  options: CartOptimizationOptions,
): SelectedCartOffer[][] {
  return wanted.map((card) => {
    const wantedCardKey = String(card.key).split(':')[0];
    const prepared = raw
    .filter((candidate) => candidate.wantedCardKey === wantedCardKey)
    .map((candidate): SelectedCartOffer | null => {
      const condition = normalizeCondition(candidate.offer.condition);
      const minimum = normalizeCondition(card.minimumCondition ?? options.defaultMinimumCondition ?? Condition.DMG);
      const steps = conditionDowngradeSteps(minimum, condition);
      const flexibility = options.conditionFlexibility;
      if (steps > 0 && (flexibility?.mode ?? 'strict') === 'strict') return null;
      if (steps > (flexibility?.maxDowngradeSteps ?? Number.POSITIVE_INFINITY)) return null;
      const requiredSet = card.preferredSetCode?.toLowerCase();
      const actualSet = candidate.setCode?.toLowerCase();
      if (requiredSet && actualSet !== requiredSet) return null;
      const price = Number(candidate.offer.price);
      if (!Number.isFinite(price) || price < 0 || !candidate.offer.store_key) return null;
      const conditionPenalty = steps > 0
        ? flexibility?.downgradePenaltyByStep?.[steps] ?? steps * (flexibility?.downgradePenaltyPerStep ?? 0)
        : 0;
      return {
        wantedCardKey: card.key, wantedCardName: card.name, offer: candidate.offer,
        storeKey: candidate.offer.store_key, storeName: candidate.offer.store,
        price, minimumCondition: minimum, condition,
        meetsMinimumCondition: steps === 0, conditionDowngradeSteps: steps,
        conditionPenalty, conditionValuePenalty: 0,
        setCode: candidate.setCode, setName: candidate.setName,
        preferredSetCode: card.preferredSetCode,
        meetsSetPreference: !requiredSet || actualSet === requiredSet, setPreferencePenalty: 0,
      };
    })
      .filter((candidate): candidate is SelectedCartOffer => candidate !== null);
    applyConditionValue(prepared, options);
    return prepared;
  });
}

function applyConditionValue(items: SelectedCartOffer[], options: CartOptimizationOptions): void {
  const policy = options.conditionValue;
  if (policy?.mode !== 'prefer-higher-condition') return;
  for (const lower of items) {
    const higher = items
      .filter((item) => item.storeKey === lower.storeKey && CONDITION_RANK[item.condition] > CONDITION_RANK[lower.condition])
      .sort((a, b) => a.price - b.price)[0];
    if (!higher || higher.price < (policy.minimumHigherConditionPrice ?? 50)) continue;
    const premium = higher.price - lower.price;
    if (premium < (policy.minUpgradePremium ?? 10) || premium > (policy.maxUpgradePremium ?? 30)) continue;
    lower.conditionValuePenalty = premium + 0.000001;
  }
}

function effectiveCost(item: SelectedCartOffer): number {
  return item.price + item.conditionPenalty + item.conditionValuePenalty + item.setPreferencePenalty;
}

function shippingFor(store: string, options: CartOptimizationOptions): number {
  return options.shippingCostByStoreKey?.[store] ?? options.defaultShippingCost ?? DEFAULT_SHIPPING;
}

function buildResult(
  wanted: CartOptimizationWantedCard[], candidates: SelectedCartOffer[][],
  rawCandidates: CartOptimizationCandidate[],
  selected: SelectedCartOffer[], options: CartOptimizationOptions,
  optimal: boolean, subsetsEvaluated: number,
): CartOptimizationResult {
  const selectedKeys = new Set(selected.map((item) => item.wantedCardKey));
  const missingCards: MissingWantedCard[] = wanted
    .map((card, index): MissingWantedCard | null => {
      if (selectedKeys.has(card.key)) return null;
      const raw = rawCandidates.filter((candidate) => candidate.wantedCardKey === card.key.split(':')[0]);
      const requiredSet = card.preferredSetCode?.toLowerCase();
      const minimum = normalizeCondition(card.minimumCondition ?? options.defaultMinimumCondition ?? Condition.DMG);
      const setEligible = requiredSet
        ? raw.filter((candidate) => candidate.setCode?.toLowerCase() === requiredSet)
        : raw;
      const reason = raw.length === 0 ? 'no-candidates'
        : setEligible.length === 0 ? 'set-mismatch-only'
        : setEligible.every((candidate) => !isConditionAtLeast(normalizeCondition(candidate.offer.condition), minimum))
          ? 'below-minimum-only'
          : candidates[index].length ? 'capacity-exhausted' : 'invalid-candidates';
      return {
      wantedCardKey: card.key, wantedCardName: card.name,
      minimumCondition: minimum, reason,
      bestRejectedOffer: raw.slice().sort((a, b) => a.offer.price - b.offer.price)[0]?.offer,
      };
    })
    .filter((card): card is MissingWantedCard => card !== null);
  const grouped = new Map<string, SelectedCartOffer[]>();
  for (const item of selected) grouped.set(item.storeKey, [...(grouped.get(item.storeKey) ?? []), item]);
  const stores: StoreCartPlan[] = [...grouped].map(([storeKey, items]) => {
    const subtotal = items.reduce((sum, item) => sum + item.price, 0);
    const shippingCost = shippingFor(storeKey, options);
    return { storeKey, storeName: items[0].storeName, shippingCost, subtotal, estimatedTotal: subtotal + shippingCost, items };
  });
  const subtotal = selected.reduce((sum, item) => sum + item.price, 0);
  const shipping = stores.reduce((sum, store) => sum + store.shippingCost, 0);
  const conditionPenalty = selected.reduce((sum, item) => sum + item.conditionPenalty, 0);
  const conditionValuePenalty = selected.reduce((sum, item) => sum + item.conditionValuePenalty, 0);
  const setPreferencePenalty = selected.reduce((sum, item) => sum + item.setPreferencePenalty, 0);
  return {
    status: wanted.length === 0 ? 'empty' : missingCards.length ? (selected.length ? 'partial' : 'empty') : 'complete',
    selectedOffers: selected, stores, missingCards,
    totals: { subtotal, shipping, estimatedTotal: subtotal + shipping, conditionPenalty, conditionValuePenalty,
      setPreferencePenalty, objectiveTotal: subtotal + shipping + conditionPenalty + conditionValuePenalty + setPreferencePenalty },
    optimal, subsetsEvaluated,
  };
}
