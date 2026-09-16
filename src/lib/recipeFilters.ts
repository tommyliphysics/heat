import { inRange, type RangeFilter } from './rangeFilter.ts'
import { computeRecipeNutritionPerServe } from './recipe.ts'
import { convertEnergy } from './units.ts'
import type { EnergyUnit, RecipeDocument } from '../types/food.ts'

export type RecipeFilterBasis = 'perServe' | 'total'

export type RangeFilterKey =
  | 'handsOnTime'
  | 'prepTime'
  | 'cookTime'
  | 'cost'
  | 'energy'
  | 'fat'
  | 'protein'
  | 'carbs'

export type RecipeFilters = Record<RangeFilterKey, RangeFilter> & {
  energyUnit: EnergyUnit
  basis: RecipeFilterBasis
}

export const EMPTY_RECIPE_FILTERS: RecipeFilters = {
  handsOnTime: { min: '', max: '' },
  prepTime: { min: '', max: '' },
  cookTime: { min: '', max: '' },
  cost: { min: '', max: '' },
  energy: { min: '', max: '' },
  fat: { min: '', max: '' },
  protein: { min: '', max: '' },
  carbs: { min: '', max: '' },
  energyUnit: 'cal',
  basis: 'perServe',
}

const RANGE_KEYS: RangeFilterKey[] = [
  'handsOnTime',
  'prepTime',
  'cookTime',
  'cost',
  'energy',
  'fat',
  'protein',
  'carbs',
]

export function hasActiveRecipeFilters(filters: RecipeFilters): boolean {
  return RANGE_KEYS.some(
    (key) => filters[key].min.trim() !== '' || filters[key].max.trim() !== '',
  )
}

type RecipeMetrics = Record<RangeFilterKey, number> & {
  costCurrency: string | null
}

/** Hands-on/prep/cook time are recipe-level and don't scale with servings, so `basis` only affects cost/energy/fat/protein/carbs. */
export function computeRecipeMetrics(
  recipe: RecipeDocument,
  basis: RecipeFilterBasis,
  energyUnit: EnergyUnit,
): RecipeMetrics {
  const servings = Number(recipe.servings) || 1
  const factor = basis === 'total' ? servings : 1
  const perServe = computeRecipeNutritionPerServe(recipe)

  return {
    handsOnTime: Number(recipe.handsOnTime) || 0,
    prepTime: Number(recipe.prepTime) || 0,
    cookTime: Number(recipe.cookTime) || 0,
    cost: (perServe.costPerServe ?? 0) * factor,
    costCurrency: perServe.costCurrency,
    energy:
      convertEnergy(perServe.energyAmount, perServe.energyUnit, energyUnit) *
      factor,
    fat: perServe.fat * factor,
    protein: perServe.protein * factor,
    carbs: perServe.carbs * factor,
  }
}

/**
 * `dominantCostCurrency` (see `recipeCostCurrency`) restricts the Cost
 * filter, when active, to recipes priced in that currency — comparing a
 * threshold against a cost in an unrelated currency would be meaningless.
 * Every other field ignores it.
 */
export function matchesRecipeFilters(
  recipe: RecipeDocument,
  filters: RecipeFilters,
  dominantCostCurrency: string | null,
): boolean {
  const metrics = computeRecipeMetrics(recipe, filters.basis, filters.energyUnit)

  for (const key of RANGE_KEYS) {
    if (key === 'cost') {
      const costFilterActive =
        filters.cost.min.trim() !== '' || filters.cost.max.trim() !== ''
      if (!costFilterActive) continue
      if (
        dominantCostCurrency &&
        metrics.costCurrency !== dominantCostCurrency
      ) {
        return false
      }
      if (!inRange(metrics.cost, filters.cost)) return false
      continue
    }

    if (!inRange(metrics[key], filters[key])) return false
  }

  return true
}

/**
 * The currency to label and restrict the Cost filter to when recipes mix
 * currencies: recipes are grouped by currency, each group's costs are
 * summed, and the currency with the highest total wins.
 */
export function recipeCostCurrency(recipes: RecipeDocument[]): string | null {
  const totals = new Map<string, number>()

  for (const recipe of recipes) {
    const { costCurrency, costPerServe } = computeRecipeNutritionPerServe(recipe)
    if (!costCurrency || costPerServe === null) continue
    totals.set(costCurrency, (totals.get(costCurrency) ?? 0) + costPerServe)
  }

  let dominant: string | null = null
  let highest = -Infinity
  for (const [currency, total] of totals) {
    if (total > highest) {
      highest = total
      dominant = currency
    }
  }

  return dominant
}
