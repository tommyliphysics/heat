import {
  computeLeftoverLedger,
  inferLeftoverChoice,
  resolveLeftoverEntry,
  type LeftoverChoice,
} from './leftovers.ts'
import { foodPriceRatio, foodQuantityRatio } from './units.ts'
import type {
  FoodDocument,
  MealDocument,
  MealEntry,
  MealListItem,
  MealTime,
  QuantityUnit,
  RecipeDocument,
} from '../types/food.ts'

export type FoodRow = {
  id: string
  foodId: string
  foodSnapshot: FoodDocument | null
  recipeId: string
  recipeSnapshot: RecipeDocument | null
  amount: string
  unit: QuantityUnit
  /** Set only on a reconstructed recipe row whose ingredients were locally edited for this meal — see `MealEntry`'s `customFoods`. Takes priority over `recipeSnapshot` in `buildFoodsMap`/`buildMealEntries`. */
  customFoods?: Record<string, FoodDocument> | null
  /** Recipe row only — this entry's leftover-tracking choices (see `lib/leftovers.ts`). Undefined until the leftover UI has resolved a value for this row; `buildMealEntries` then treats it as "cook fresh, don't track" (full hands-on time, no ledger contribution). */
  leftoverChoice?: LeftoverChoice
}

function sumAmount(a: string, b: string): string {
  const sum = (Number(a) || 0) + (Number(b) || 0)
  return String(Math.round(sum * 1000) / 1000)
}

function scaleAmount(amount: string, ratio: number): string {
  const num = Number(amount)
  if (Number.isNaN(num)) return amount
  return String(Math.round(num * ratio * 1000) / 1000)
}

/**
 * Combines two contributions of the same food into one entry (e.g. a food
 * added directly to a meal and the same food pulled in via a recipe).
 * Energy/macro/price totals are unit-independent so they always sum
 * correctly; if the two quantities happen to use different units, the
 * amounts are still summed as raw numbers rather than converted, since
 * reconciling units isn't worth the complexity for what should be a rare
 * collision.
 */
function mergeFoodDocuments(a: FoodDocument, b: FoodDocument): FoodDocument {
  const micronutrients = { ...a.micronutrients }
  for (const [name, micro] of Object.entries(b.micronutrients ?? {})) {
    const existing = micronutrients[name]
    micronutrients[name] = existing
      ? { amount: sumAmount(existing.amount, micro.amount), unit: existing.unit }
      : micro
  }

  return {
    name: a.name,
    ...(a.brand ? { brand: a.brand } : {}),
    quantity: {
      amount: sumAmount(a.quantity.amount, b.quantity.amount),
      unit: a.quantity.unit,
    },
    energy: {
      amount: sumAmount(a.energy.amount, b.energy.amount),
      unit: a.energy.unit,
    },
    macronutrients: {
      carbs: {
        amount: sumAmount(
          a.macronutrients.carbs.amount,
          b.macronutrients.carbs.amount,
        ),
        unit: 'g',
      },
      fat: {
        amount: sumAmount(
          a.macronutrients.fat.amount,
          b.macronutrients.fat.amount,
        ),
        unit: 'g',
      },
      protein: {
        amount: sumAmount(
          a.macronutrients.protein.amount,
          b.macronutrients.protein.amount,
        ),
        unit: 'g',
      },
    },
    micronutrients,
    price: {
      amount: sumAmount(a.price.amount, b.price.amount),
      currency: a.price.currency,
      retailer: a.price.retailer,
    },
  }
}

/**
 * Scales every amount on a food snapshot by `ratio` (e.g. servings eaten /
 * recipe servings). `priceRatio` scales the price separately — it can
 * differ from `ratio` since the price may be quoted for a different
 * quantity than nutrition is recorded per (see `foodPriceRatio`) — and
 * defaults to `ratio` when the caller has no reason to distinguish them.
 */
export function scaleFoodDocument(
  food: FoodDocument,
  ratio: number,
  priceRatio: number = ratio,
): FoodDocument {
  return {
    name: food.name,
    ...(food.brand ? { brand: food.brand } : {}),
    quantity: {
      amount: scaleAmount(food.quantity.amount, ratio),
      unit: food.quantity.unit,
    },
    energy: {
      amount: scaleAmount(food.energy.amount, ratio),
      unit: food.energy.unit,
    },
    macronutrients: {
      carbs: {
        amount: scaleAmount(food.macronutrients.carbs.amount, ratio),
        unit: 'g',
      },
      fat: {
        amount: scaleAmount(food.macronutrients.fat.amount, ratio),
        unit: 'g',
      },
      protein: {
        amount: scaleAmount(food.macronutrients.protein.amount, ratio),
        unit: 'g',
      },
    },
    micronutrients: Object.fromEntries(
      Object.entries(food.micronutrients ?? {}).map(([name, m]) => [
        name,
        { amount: scaleAmount(m.amount, ratio), unit: m.unit },
      ]),
    ),
    price: {
      ...food.price,
      amount: scaleAmount(food.price.amount, priceRatio),
    },
  }
}

/**
 * `currentFoods` (a foodId -> current food record lookup) lets a recipe row's
 * ingredients be scaled from each food's *current* data rather than the
 * recipe's own frozen snapshot — matching how the recipe view page itself
 * computes nutrition. Without this, a recipe added to a meal could show
 * different macros than viewing that same recipe directly, whenever the
 * recipe's stored ingredient snapshot is stale relative to the food's
 * current record. Ingredients missing from `currentFoods` fall back to the
 * recipe's own stored snapshot.
 */
export function buildFoodsMap(
  rows: FoodRow[],
  currentFoods: Record<string, FoodDocument> = {},
): Record<string, FoodDocument> {
  const result: Record<string, FoodDocument> = {}

  function addEntry(foodId: string, food: FoodDocument) {
    const existing = result[foodId]
    result[foodId] = existing ? mergeFoodDocuments(existing, food) : food
  }

  for (const row of rows) {
    if (row.customFoods) {
      for (const [foodId, food] of Object.entries(row.customFoods)) {
        addEntry(foodId, food)
      }
      continue
    }

    if (row.recipeSnapshot) {
      const servings = Number(row.amount) || 0
      const recipeServings = Number(row.recipeSnapshot.servings) || 0
      const recipeRatio = recipeServings ? servings / recipeServings : 0

      for (const [foodId, listedFood] of Object.entries(
        row.recipeSnapshot.foods ?? {},
      )) {
        const currentFood = currentFoods[foodId]
        if (currentFood) {
          const fullRecipeRatio = foodQuantityRatio(
            currentFood,
            listedFood.quantity.amount,
            listedFood.quantity.unit,
          )
          const fullRecipePriceRatio = foodPriceRatio(
            currentFood,
            listedFood.quantity.amount,
            listedFood.quantity.unit,
          )
          addEntry(
            foodId,
            scaleFoodDocument(
              currentFood,
              fullRecipeRatio * recipeRatio,
              fullRecipePriceRatio * recipeRatio,
            ),
          )
        } else {
          addEntry(foodId, scaleFoodDocument(listedFood, recipeRatio))
        }
      }
      continue
    }

    if (row.foodId && row.foodSnapshot) {
      const ratio = foodQuantityRatio(row.foodSnapshot, row.amount, row.unit)
      const priceRatio = foodPriceRatio(row.foodSnapshot, row.amount, row.unit)
      addEntry(row.foodId, {
        ...scaleFoodDocument(row.foodSnapshot, ratio, priceRatio),
        quantity: { amount: row.amount, unit: row.unit },
      })
    }
  }

  return result
}

export function foodsMapToRows(
  foods: Record<string, FoodDocument> | undefined,
): FoodRow[] {
  return Object.entries(foods ?? {}).map(([foodId, food]) => ({
    id: crypto.randomUUID(),
    foodId,
    foodSnapshot: food,
    recipeId: '',
    recipeSnapshot: null,
    amount: food.quantity.amount,
    unit: food.quantity.unit,
  }))
}

/**
 * Reconstructs a meal's rows for editing from its saved `entries` — what the
 * user actually entered — keeping each recipe as a single row rather than
 * flattening it into its ingredients. Flattening would lose the recipe
 * grouping entirely on the next save, since `buildMealEntries` only
 * recognizes an actual recipe row (one with `recipeSnapshot` set), not a
 * cosmetic label on separate food rows.
 *
 * `recipeSnapshot` is left null here and hydrated later from the live
 * recipes list (this is a pure function with no Firestore access) — see
 * `MealForm`'s recipe-hydration effect.
 *
 * Falls back to a flat reconstruction from `foods` for meals saved before
 * `entries` existed.
 */
export function mealToRows(meal: MealDocument): FoodRow[] {
  if (!meal.entries) return foodsMapToRows(meal.foods)

  return meal.entries.map((entry): FoodRow => {
    if (entry.kind === 'recipe') {
      return {
        id: crypto.randomUUID(),
        foodId: '',
        foodSnapshot: null,
        recipeId: entry.recipeId,
        recipeSnapshot: null,
        amount: entry.servings,
        unit: 'serving',
        customFoods: entry.customFoods ?? null,
        leftoverChoice: inferLeftoverChoice(entry.batchServings, entry.handsOnTime),
      }
    }

    const food = meal.foods[entry.foodId] as FoodDocument | undefined
    return {
      id: crypto.randomUUID(),
      foodId: entry.foodId,
      foodSnapshot: food ?? null,
      recipeId: '',
      recipeSnapshot: null,
      amount: food?.quantity.amount ?? '',
      unit: food?.quantity.unit ?? 'g',
    }
  })
}

/**
 * Records what the user actually entered into a meal — individual foods and
 * recipes (with the recipe's own scaled ingredient list attached) — rather
 * than the flattened food totals `buildFoodsMap` produces. Used only for
 * display (e.g. the calendar's expandable ingredient list); nutrition/report
 * calculations should keep using `buildFoodsMap`'s flattened output.
 *
 * `allMeals`/`mealDate`/`mealTime`/`excludeMealId` locate this meal's
 * position in each recipe row's leftover-tracking ledger (see
 * `lib/leftovers.ts`) so `batchServings`/`handsOnTime` resolve correctly
 * from the row's `leftoverChoice`. Callers that don't care about that
 * resolution (e.g. a live ingredient-list preview) can omit them — every
 * row then resolves as a fresh, untracked cook.
 */
export function buildMealEntries(
  rows: FoodRow[],
  allMeals: MealListItem[] = [],
  mealDate: string = '',
  mealTime: MealTime = '',
  excludeMealId: string | null = null,
): MealEntry[] {
  const entries: MealEntry[] = []

  for (const row of rows) {
    if (row.recipeSnapshot && row.recipeId) {
      const servingsEntered = Number(row.amount) || 0
      const recipeServings = Number(row.recipeSnapshot.servings) || 0
      const ratio = recipeServings ? servingsEntered / recipeServings : 0

      const ledger = computeLeftoverLedger(
        row.recipeId,
        recipeServings,
        allMeals,
        excludeMealId,
        mealDate,
        mealTime,
      )
      const { batchServings, handsOnTime } = resolveLeftoverEntry(
        ledger,
        servingsEntered,
        row.recipeSnapshot.handsOnTime ?? '',
        row.leftoverChoice ?? { usesLeftovers: false, reserveSurplus: false },
      )

      if (row.customFoods) {
        entries.push({
          kind: 'recipe',
          recipeId: row.recipeId,
          name: row.recipeSnapshot.name,
          servings: row.amount,
          foods: Object.entries(row.customFoods).map(([foodId, food]) => ({
            foodId,
            name: food.name,
            amount: food.quantity.amount,
            unit: food.quantity.unit,
          })),
          handsOnTime,
          batchServings,
          customFoods: row.customFoods,
        })
        continue
      }

      entries.push({
        kind: 'recipe',
        recipeId: row.recipeId,
        name: row.recipeSnapshot.name,
        servings: row.amount,
        foods: Object.entries(row.recipeSnapshot.foods ?? {}).map(
          ([foodId, food]) => {
            const scaled = scaleFoodDocument(food, ratio)
            return {
              foodId,
              name: scaled.name,
              amount: scaled.quantity.amount,
              unit: scaled.quantity.unit,
            }
          },
        ),
        handsOnTime,
        batchServings,
      })
      continue
    }

    if (row.foodId && row.foodSnapshot) {
      entries.push({
        kind: 'food',
        foodId: row.foodId,
        name: row.foodSnapshot.name,
      })
    }
  }

  return entries
}
