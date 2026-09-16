import {
  buildFoodsMap,
  foodsMapToRows,
  scaleFoodDocument,
  type FoodRow,
} from './foodRow.ts'
import {
  foodPriceRatio,
  foodQuantityRatio,
  fromCalories,
  toCalories,
} from './units.ts'
import type { EnergyUnit, FoodDocument, RecipeDocument } from '../types/food.ts'

export type RecipeFormValues = {
  name: string
  servings: string
  rows: FoodRow[]
  recipeText: string
  equipment: string[]
  handsOnTime: string
  prepTime: string
  cookTime: string
}

export const EMPTY_RECIPE_FORM_VALUES: RecipeFormValues = {
  name: '',
  servings: '',
  rows: [],
  recipeText: '',
  equipment: [],
  handsOnTime: '',
  prepTime: '',
  cookTime: '',
}

export function buildRecipeDocument(
  values: RecipeFormValues,
): RecipeDocument {
  return {
    name: values.name,
    servings: values.servings,
    foods: buildFoodsMap(values.rows),
    recipeText: values.recipeText,
    equipment: values.equipment,
    handsOnTime: values.handsOnTime,
    prepTime: values.prepTime,
    cookTime: values.cookTime,
  }
}

export type RecipeNutritionPerServe = {
  energyAmount: number
  energyUnit: EnergyUnit
  carbs: number
  fat: number
  protein: number
  costPerServe: number | null
  costCurrency: string | null
}

/**
 * Totals a recipe's ingredients and divides by its serving count. Cost is
 * only included when every priced ingredient shares one currency — mixing
 * currencies can't be summed into a single meaningful per-serve cost.
 *
 * The energy total is displayed in whichever unit (cal/kJ) the recipe's own
 * ingredients contribute the most energy in — not just whichever unit makes
 * the number look biggest — so a recipe built mostly from kJ-labeled foods
 * displays in kJ, and one built mostly from cal-labeled foods displays in
 * cal, regardless of a stray ingredient using the other unit.
 *
 * `currentFoods` (a foodId -> current food record lookup) lets this
 * recompute each ingredient's nutrition from the food's live data and the
 * amount actually listed in the recipe, rather than trusting whatever
 * energy/macro numbers happen to be frozen on the recipe's stored snapshot
 * — those are only ever as correct as they were the moment the recipe was
 * last saved. Ingredients missing from `currentFoods` (food deleted, or the
 * lookup omitted) fall back to the recipe's own stored snapshot as-is.
 */
export function computeRecipeNutritionPerServe(
  recipe: RecipeDocument,
  currentFoods: Record<string, FoodDocument> = {},
): RecipeNutritionPerServe {
  const servings = Number(recipe.servings) || 1

  let totalCalories = 0
  let totalCarbs = 0
  let totalFat = 0
  let totalProtein = 0
  let totalCost = 0
  const caloriesByEnergyUnit = new Map<EnergyUnit, number>()
  const currencies = new Set<string>()

  for (const [foodId, listedFood] of Object.entries(recipe.foods ?? {})) {
    const currentFood = currentFoods[foodId]
    const food = currentFood
      ? scaleFoodDocument(
          currentFood,
          foodQuantityRatio(
            currentFood,
            listedFood.quantity.amount,
            listedFood.quantity.unit,
          ),
          foodPriceRatio(
            currentFood,
            listedFood.quantity.amount,
            listedFood.quantity.unit,
          ),
        )
      : listedFood

    const calories = toCalories(food.energy.amount, food.energy.unit)
    totalCalories += calories
    if (food.energy.unit) {
      caloriesByEnergyUnit.set(
        food.energy.unit,
        (caloriesByEnergyUnit.get(food.energy.unit) ?? 0) + calories,
      )
    }

    totalCarbs += Number(food.macronutrients.carbs.amount) || 0
    totalFat += Number(food.macronutrients.fat.amount) || 0
    totalProtein += Number(food.macronutrients.protein.amount) || 0

    const price = Number(food.price.amount)
    if (!Number.isNaN(price)) totalCost += price
    if (food.price.currency) currencies.add(food.price.currency)
  }

  let energyUnit: EnergyUnit = 'cal'
  let bestUnitCalories = -Infinity
  for (const [unit, calories] of caloriesByEnergyUnit) {
    if (calories > bestUnitCalories) {
      bestUnitCalories = calories
      energyUnit = unit
    }
  }

  const singleCurrency = currencies.size === 1 ? [...currencies][0] : null

  return {
    energyAmount: fromCalories(totalCalories, energyUnit) / servings,
    energyUnit,
    carbs: totalCarbs / servings,
    fat: totalFat / servings,
    protein: totalProtein / servings,
    costPerServe: singleCurrency ? totalCost / servings : null,
    costCurrency: singleCurrency,
  }
}

export function recipeDocumentToFormValues(
  record: RecipeDocument,
): RecipeFormValues {
  return {
    name: record.name,
    servings: record.servings,
    rows: foodsMapToRows(record.foods),
    recipeText: record.recipeText ?? '',
    equipment: record.equipment ?? [],
    handsOnTime: record.handsOnTime ?? '',
    prepTime: record.prepTime ?? '',
    cookTime: record.cookTime ?? '',
  }
}
