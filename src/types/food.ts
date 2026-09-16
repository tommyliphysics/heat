export type MicronutrientUnit = 'g' | 'mg' | 'ug'

export type Micronutrient = {
  id: string
  name: string
  amount: string
  unit: MicronutrientUnit
}

export type QuantityUnit =
  | 'g'
  | 'kg'
  | 'lb'
  | 'oz'
  | 'mL'
  | 'L'
  | 'qt'
  | 'fl oz'
  | ''
  | 'serving'

export type EnergyUnit = 'cal' | 'kJ'

/** One retailer's recorded price for a food. At most one record per retailer; exactly one is flagged `latest`. */
export type PriceRecord = {
  retailer: string
  amount: string
  currency: string
  latest: boolean
  /** How much this price buys — any unit compatible with the food's own `quantity.unit` (weight or volume), or 'serving'. Optional for backward compatibility with price records saved before this existed. */
  quantity?: { amount: string; unit: QuantityUnit }
}

/** Where a food/recipe actually came from, if not entered directly — absent means the account's own original entry. Snapshotted at import time, not kept live in sync (same convention as `ConnectionDocument.peerAlias` elsewhere) — if the source connection later renames themselves or their food, this doesn't update. */
export type AddedFromInfo =
  | { type: 'connection'; peerUid: string; peerName: string }
  | { type: 'public'; source: string }

export type FoodDocument = {
  name: string
  /** The food's brand, e.g. "Sunrice" — one value per food, not per retailer (unlike `prices`, since the same product is still the same brand regardless of where it was bought). Absent rather than empty when not set: built by `buildFoodDocument` so an empty entry never gets written. See `foodDisplayName` for how this renders next to the name. */
  brand?: string
  /** The group (see `types/groups.ts`) allowed to read this food — grants read only, never write, enforced in `firestore.rules`, not by any client-side check. Absent is private, the default until explicitly shared. One group at a time: sharing with "several people" is satisfied by the group itself having several members, so putting a food in two different circles' view means putting them in one group rather than sharing with two groups at once. */
  sharedWith?: string
  /** `Date.now()` at creation. Optional for backward compatibility with foods saved before this existed. */
  createdAt?: number
  /** Set only when this food was copied in via the Connections/Reference tabs rather than entered directly — see `AddedFromInfo`. */
  addedFrom?: AddedFromInfo
  quantity: { amount: string; unit: QuantityUnit }
  /** Free-text label for a real-world serving, e.g. "140g (1 fruit)" — descriptive only, not used in nutrition/cost math. Optional for backward compatibility. */
  servingSize?: string
  energy: { amount: string; unit: EnergyUnit }
  macronutrients: {
    carbs: { amount: string; unit: 'g' }
    fat: { amount: string; unit: 'g' }
    protein: { amount: string; unit: 'g' }
  }
  micronutrients: Record<string, { amount: string; unit: MicronutrientUnit }>
  /** Mirrors the `latest` entry in `prices` (or the pre-multi-retailer value for older records); this is what the rest of the app reads for cost/nutrition math. */
  price: {
    amount: string
    currency: string
    retailer: string
    quantity?: { amount: string; unit: QuantityUnit }
  }
  /** Per-retailer price history. Optional for backward compatibility with foods saved before this existed. */
  prices?: PriceRecord[]
}

/** A shared reference food from /public/publicNutritionData/foods, values per 100g edible portion. */
export type PublicFoodDocument = {
  name: string
  source: string
  energy: { amount: string; unit: EnergyUnit }
  macronutrients: {
    carbs: { amount: string; unit: 'g' }
    fat: { amount: string; unit: 'g' }
    protein: { amount: string; unit: 'g' }
  }
  micronutrients: Record<string, { amount: string; unit: MicronutrientUnit }>
}

export type MealTime = '' | 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'drink'

export type MealEntry =
  | { kind: 'food'; foodId: string; name: string }
  | {
      kind: 'recipe'
      recipeId: string
      name: string
      servings: string
      foods: { foodId: string; name: string; amount: string; unit: QuantityUnit }[]
      /** Minutes — the recipe's full listed hands-on time if cooking happened for this entry, or '0' if this entry is purely eating an already-cooked batch (see `batchServings`/`lib/leftovers.ts`). Never a fraction of the recipe's time: active prep doesn't scale down just because you're eating a smaller portion of what you cooked. */
      handsOnTime?: string
      /** How many servings this entry contributes to the recipe's leftover-tracking ledger (0 if it opts out of tracking) — see `lib/leftovers.ts`. Lets the app know, the next time this recipe is added to a meal, whether there's already a batch's worth of leftovers to draw on before cooking again. */
      batchServings?: string
      /**
       * Present once the user has edited this recipe's ingredients for this
       * meal only (via the calendar's per-meal recipe editor), keyed by
       * foodId with each ingredient already scaled to the amount used here.
       * When set, this entry's contribution to `MealDocument.foods` (and thus
       * all nutrition/cost stats) is taken directly from this map instead of
       * being recomputed from the live recipe document.
       */
      customFoods?: Record<string, FoodDocument>
    }

export type MealDocument = {
  date: string
  time: MealTime
  foods: Record<string, FoodDocument>
  entries?: MealEntry[]
  /**
   * Set once this meal's ingredients have been deducted from inventory via
   * the "Mark as Prepared" flow (see `lib/mealPreparation.ts`) — the exact
   * time (not just date) the user says preparation finished. Its presence
   * tells the automatic end-of-day catch-up (`lib/inventoryReconcile.ts`)
   * to skip this meal entirely, so it isn't deducted a second time once
   * its date rolls over.
   */
  preparedDeductionAt?: number
}

export type RecipeDocument = {
  name: string
  servings: string
  foods: Record<string, FoodDocument>
  recipeText: string
  /** The group allowed to read this recipe — see `FoodDocument.sharedWith`'s doc comment, same rules apply (read-only, one group at a time). */
  sharedWith?: string
  /** Kitchen tools/appliances this recipe needs (e.g. "Dutch Oven", "Stand Mixer") — free text, not tied to any catalog id, so a shared recipe's list still reads sensibly even after `data/kitchenEquipment.ts`'s suggestions change. Optional while private; enforced non-empty only at the moment a recipe is shared (see `MyRecipesPage.tsx`'s `handleChangeSharedWith`) since an unshared recipe has no one else who'd need to know what it requires. */
  equipment?: string[]
  /** Minutes. Optional for backward compatibility with recipes saved before these existed. */
  handsOnTime?: string
  prepTime?: string
  cookTime?: string
  /** Date.now() at creation. Optional for backward compatibility with recipes saved before this existed. */
  createdAt?: number
  /** Set only when this recipe was copied in via the Recipes page's Connections tab rather than entered directly — see `AddedFromInfo`. */
  addedFrom?: AddedFromInfo
}

export type MealListItem = MealDocument & { id: string }

/** A hand-added shopping list item, independent of any meal/recipe. */
export type ShoppingListItemDocument = {
  name: string
  amount: string
  unit: QuantityUnit
  price: string
  currency: string
  createdAt: number
}

/** One recorded change to a batch's remaining amount — either a manual edit on the Inventory page, or an automatic decrement from meal consumption (see `lib/inventoryReconcile.ts`). Always expressed in the batch's own `unit` (never `remainingUnit`). Entries are append-only and kept in chronological order, so the last one is always the current amount. */
export type InventoryRemainingEntry = {
  amount: string
  /** `Date.now()`-style milliseconds since epoch. For an auto-decrement entry, this is local noon of the day it accounts for (not the real time the catch-up ran), so the history reads as "here's what changed, and on which day" rather than "here's when the catch-up job happened to run". */
  timestamp: number
}

/**
 * One purchase of a food added to the user's inventory — how much was
 * bought and what it cost. Multiple batches can exist for the same food
 * (bought at different times/prices); they're drawn down oldest-first as
 * meals are planned, so a meal's cost reflects what was actually paid for
 * the food it used rather than the food's current My Foods price. Batches
 * are never mutated to track *cost* — a meal's cost is always re-derived
 * from the batch amount and the meals that use it (see `lib/inventory.ts`).
 * `remainingHistory`, in contrast, IS a mutated running record of how much
 * physically remains, kept up to date by both manual edits and automatic
 * consumption tracking (see `lib/inventoryReconcile.ts`).
 */
export type InventoryBatchDocument = {
  /** 'food' links this batch to a My Foods record (`foodId` set, nutrition/cost math available); 'other' is a non-food inventory item (cleaning supplies, etc.) with no nutrition data. Optional for backward compatibility — every batch saved before this existed is a food batch, so treat a missing value as 'food'. */
  kind?: 'food' | 'other'
  /** The linked My Foods record. Present only when `kind` is 'food' (or unset, for backward compatibility). */
  foodId?: string
  /** Display name — either the linked food's name (snapshotted at purchase time, so a batch still displays sensibly if the food is later renamed or deleted) or, for an 'other' item, whatever name the user gave it. */
  foodName: string
  /** The linked food's brand, snapshotted alongside `foodName` at purchase time. For a GROUP inventory batch this doubles as the cross-member matching key — see `lib/inventoryReconcile.ts` — since two different members' food records for "the same" product have different `foodId`s but, by the no-duplicate-name+brand rule (`findDuplicateFood`), the same (`foodName`, `brand`) pair; consumption from any member's meal matches a group batch by that pair, not by `foodId`. Absent for an 'other' item or a food with no brand on record. */
  brand?: string
  /** Where an 'other' item was bought. Not collected for food batches — a food's own price record already has its own retailer. Optional even for 'other' batches saved before this existed. */
  retailer?: string
  amount: string
  unit: QuantityUnit
  /** Total price paid for `amount` of this batch — cost calculations always use this and `amount`, never `remainingHistory`. */
  price: string
  currency: string
  /** 'YYYY-MM-DD' — when this batch was bought, used to order batches (oldest first) and to decide which meals it can cover (only meals on or after this date). */
  purchasedAt: string
  /** How much of `amount` is still on hand, as a full change history rather than just the latest number — see `InventoryRemainingEntry`. Seeded with one entry (the full `amount`) when the batch is added; the last entry is always the current value. Drives the Shopping List's bought/unbought status; never affects cost. Optional for backward compatibility with batches saved before this existed — treat a missing/empty history as still equal to `amount`. */
  remainingHistory?: InventoryRemainingEntry[]
  /** The unit `remainingHistory` amounts are displayed/edited in on the Inventory page — any unit convertible from `unit` (see `compatibleQuantityUnits`), independent of the unit they're actually stored in. Optional; falls back to `unit` for batches saved before this existed. */
  remainingUnit?: QuantityUnit
}

export type InventoryBatchItem = InventoryBatchDocument & { id: string }
