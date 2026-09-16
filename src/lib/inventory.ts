import { normalizedFoodKey } from './food.ts'
import { GRAMS_PER_UNIT, ML_PER_UNIT, toGrams, toMilliliters } from './units.ts'
import type {
  InventoryBatchDocument,
  InventoryBatchItem,
  MealListItem,
  QuantityUnit,
} from '../types/food.ts'

/** A single amount expressed in whatever base unit its measurement kind uses (grams, milliliters, or a raw count/serving number) — the common scale batches and meal usages of the same food are compared in. Exported for `lib/inventoryReconcile.ts`, which needs the same conversion when tallying meal consumption. */
export function baseQuantity(amount: string, unit: QuantityUnit): number {
  const grams = toGrams(amount, unit)
  if (grams) return grams
  const milliliters = toMilliliters(amount, unit)
  if (milliliters) return milliliters
  return Number(amount) || 0
}

/** Inverse of `baseQuantity` — re-expresses a base (grams/mL/count) amount back in `unit`. */
export function fromBaseQuantity(baseAmount: number, unit: QuantityUnit): number {
  if (unit in GRAMS_PER_UNIT) {
    return baseAmount / GRAMS_PER_UNIT[unit as keyof typeof GRAMS_PER_UNIT]
  }
  if (unit in ML_PER_UNIT) {
    return baseAmount / ML_PER_UNIT[unit as keyof typeof ML_PER_UNIT]
  }
  return baseAmount
}

/**
 * The current remaining amount (in the batch's own `unit`) — the last entry
 * in `remainingHistory`, chronologically.
 *
 * Falls back, for a batch with no history yet, to the old scalar `remaining`
 * field this replaced — still physically present in Firestore on any batch
 * saved before history tracking existed (removing a field from the TS type
 * doesn't delete it from the document), read here via an unchecked lookup
 * since it's deliberately no longer part of `InventoryBatchDocument`. Only
 * once neither exists does this fall back further, to the full `amount`.
 * This is what makes switching to history tracking non-destructive: an
 * existing manually-tracked value keeps showing correctly, and becomes the
 * real seed the first time this batch is actually touched (by a manual
 * edit or `reconcileInventory`), rather than being silently reset to "full
 * amount, nothing used yet".
 */
export function latestRemaining(
  batch: Pick<InventoryBatchDocument, 'amount' | 'remainingHistory'>,
): string {
  const history = batch.remainingHistory
  if (history && history.length > 0) return history[history.length - 1].amount
  return legacyOrFullAmount(batch)
}

/** The pre-history baseline for a batch that has no `remainingHistory` yet — see `latestRemaining`'s doc comment. Exported so `lib/inventoryReconcile.ts` seeds its FIFO math from the same value `latestRemaining` would currently display, rather than resetting it to `amount`. */
export function legacyOrFullAmount(
  batch: Pick<InventoryBatchDocument, 'amount'>,
): string {
  const legacyRemaining = (batch as { remaining?: string }).remaining
  return legacyRemaining ?? batch.amount
}

type LedgerEvent = {
  mealId: string
  date: string
  foodId: string
  baseAmount: number
  originalPrice: number
  currency: string
  /** Carried alongside `foodId` so a food's batch pool can also include a group's shared batches, which are matched by name+brand rather than `foodId` — see `applyInventoryPricing`'s doc comment. */
  name: string
  brand?: string
}

function eventKey(mealId: string, foodId: string): string {
  return `${mealId}|${foodId}`
}

/**
 * Walks one food's purchase batches (oldest first) against its usage events
 * (earliest meal first), consuming each event's demand from whichever
 * batches were bought on or before that event's date. A batch only
 * contributes to an event when their currencies match — mixing currencies
 * without a conversion would silently misprice things, so a
 * different-currency batch is simply skipped for that event (it still
 * remains available for later events in its own currency).
 */
function consumeFoodBatches(
  batches: InventoryBatchItem[],
  events: LedgerEvent[],
): {
  adjustedPrice: Map<string, number>
  shortfall: Map<string, number>
} {
  const sortedBatches = [...batches].sort(
    (a, b) => a.purchasedAt.localeCompare(b.purchasedAt) || a.id.localeCompare(b.id),
  )
  const sortedEvents = [...events].sort(
    (a, b) => a.date.localeCompare(b.date) || a.mealId.localeCompare(b.mealId),
  )

  const pool = sortedBatches.map((batch) => {
    const amount = baseQuantity(batch.amount, batch.unit)
    return {
      batch,
      remaining: amount,
      unitCost: amount ? (Number(batch.price) || 0) / amount : 0,
    }
  })

  const adjustedPrice = new Map<string, number>()
  const shortfall = new Map<string, number>()

  let nextBatchIdx = 0
  const admitted: typeof pool = []

  for (const event of sortedEvents) {
    while (
      nextBatchIdx < pool.length &&
      pool[nextBatchIdx].batch.purchasedAt <= event.date
    ) {
      admitted.push(pool[nextBatchIdx])
      nextBatchIdx++
    }

    let need = event.baseAmount
    let costFromInventory = 0
    for (const entry of admitted) {
      if (need <= 0) break
      if (entry.remaining <= 0) continue
      if (entry.batch.currency !== event.currency) continue
      const used = Math.min(entry.remaining, need)
      costFromInventory += used * entry.unitCost
      entry.remaining -= used
      need -= used
    }

    const shortfallCost =
      event.baseAmount > 0 ? event.originalPrice * (need / event.baseAmount) : 0

    const key = eventKey(event.mealId, event.foodId)
    adjustedPrice.set(key, costFromInventory + shortfallCost)
    shortfall.set(key, need)
  }

  return { adjustedPrice, shortfall }
}

function buildEventsByFood(
  meals: MealListItem[],
): Map<string, LedgerEvent[]> {
  const eventsByFood = new Map<string, LedgerEvent[]>()
  for (const meal of meals) {
    for (const [foodId, food] of Object.entries(meal.foods ?? {})) {
      const list = eventsByFood.get(foodId) ?? []
      list.push({
        mealId: meal.id,
        date: meal.date,
        foodId,
        baseAmount: baseQuantity(food.quantity.amount, food.quantity.unit),
        originalPrice: Number(food.price.amount) || 0,
        currency: food.price.currency,
        name: food.name,
        brand: food.brand,
      })
      eventsByFood.set(foodId, list)
    }
  }
  return eventsByFood
}

/**
 * Re-prices every meal's use of a food against its inventory batches,
 * walking ALL meals (past and future) in date order so a batch is only ever
 * matched to meals on or after its purchase date, and earlier meals get
 * first claim on it. A meal's cost for a food is left unchanged for any
 * portion inventory doesn't cover — that portion still needs buying at the
 * food's current (My Foods-derived) price. Purely a re-derivation; the
 * batches and meals passed in are never mutated.
 *
 * `batches` is expected to be this account's own personal batches plus
 * every group's the account belongs to, pooled together by the caller
 * (Calendar/Shopping List pages) — a batch matches an event either by
 * exact `foodId` (this account's own batches) or, failing that, by
 * name+brand (a group's shared batches, which carry a *different*
 * member's `foodId` — see `lib/inventoryReconcile.ts`'s `groupTier` for
 * the same identity problem on the write side). Unlike actual consumption,
 * this doesn't tier personal-before-group; every eligible batch is drawn
 * oldest-purchased-first regardless of source, which is a reasonable
 * simplification for a cost *estimate* rather than the real deduction.
 * This also deliberately never pools in *other members'* meals to compute
 * a shared batch's true remaining draw — only this account's own meals are
 * ever read here, to keep meals fully private; a shared batch's reported
 * cost can look mildly off if another member has also been drawing on it,
 * an accepted trade for that privacy.
 */
export function applyInventoryPricing(
  meals: MealListItem[],
  batches: InventoryBatchItem[],
): { meals: MealListItem[]; shortfall: Map<string, number> } {
  if (batches.length === 0) {
    return { meals, shortfall: new Map() }
  }

  const eventsByFood = buildEventsByFood(meals)

  const adjustedPrice = new Map<string, number>()
  const shortfall = new Map<string, number>()

  for (const [foodId, events] of eventsByFood) {
    const key = normalizedFoodKey(events[0].name, events[0].brand)
    const matchingBatches = batches.filter(
      (batch) =>
        batch.foodId === foodId ||
        (!!batch.foodId && normalizedFoodKey(batch.foodName, batch.brand) === key),
    )
    const result = consumeFoodBatches(matchingBatches, events)
    for (const [k, value] of result.adjustedPrice) adjustedPrice.set(k, value)
    for (const [k, value] of result.shortfall) shortfall.set(k, value)
  }

  const pricedMeals = meals.map((meal) => {
    let changed = false
    const nextFoods: MealListItem['foods'] = {}
    for (const [foodId, food] of Object.entries(meal.foods ?? {})) {
      const price = adjustedPrice.get(eventKey(meal.id, foodId))
      if (price === undefined) {
        nextFoods[foodId] = food
        continue
      }
      changed = true
      nextFoods[foodId] = {
        ...food,
        price: { ...food.price, amount: String(price) },
      }
    }
    return changed ? { ...meal, foods: nextFoods } : meal
  })

  return { meals: pricedMeals, shortfall }
}

/**
 * Whether a food's total demand across `meals` is covered by its inventory
 * batches' remaining amounts — the Shopping List's "bought" status. This is
 * deliberately independent of `applyInventoryPricing`'s consumption ledger
 * (which drives cost, based on what was purchased): the checkmark instead
 * reflects whatever's actually left on hand right now (each batch's latest
 * `remainingHistory` entry — see `latestRemaining` — kept current by both
 * manual edits and automatic consumption tracking, see
 * `lib/inventoryReconcile.ts`).
 */
export function isFoodStocked(
  foodId: string,
  meals: MealListItem[],
  batches: InventoryBatchItem[],
): boolean {
  let demand = 0
  for (const meal of meals) {
    const food = meal.foods?.[foodId]
    if (food) demand += baseQuantity(food.quantity.amount, food.quantity.unit)
  }
  if (demand <= 0) return false

  let available = 0
  for (const batch of batches) {
    if (batch.foodId !== foodId) continue
    available += baseQuantity(latestRemaining(batch), batch.unit)
  }
  return available >= demand
}
