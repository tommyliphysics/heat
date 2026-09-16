import { inRange, type RangeFilter } from './rangeFilter.ts'
import { convertEnergy } from './units.ts'
import type { EnergyUnit, FoodDocument } from '../types/food.ts'

export type FoodRangeFilterKey = 'cost' | 'energy' | 'fat' | 'protein' | 'carbs'

export type FoodFilters = Record<FoodRangeFilterKey, RangeFilter> & {
  energyUnit: EnergyUnit
}

export const EMPTY_FOOD_FILTERS: FoodFilters = {
  cost: { min: '', max: '' },
  energy: { min: '', max: '' },
  fat: { min: '', max: '' },
  protein: { min: '', max: '' },
  carbs: { min: '', max: '' },
  energyUnit: 'cal',
}

const RANGE_KEYS: FoodRangeFilterKey[] = [
  'cost',
  'energy',
  'fat',
  'protein',
  'carbs',
]

export function hasActiveFoodFilters(filters: FoodFilters): boolean {
  return RANGE_KEYS.some(
    (key) => filters[key].min.trim() !== '' || filters[key].max.trim() !== '',
  )
}

type FoodMetrics = Record<FoodRangeFilterKey, number> & {
  costCurrency: string | null
}

/** Values are for the food's own stored quantity — a food has no "per serve vs total" split the way a multi-serving recipe does. */
export function computeFoodMetrics(
  food: FoodDocument,
  energyUnit: EnergyUnit,
): FoodMetrics {
  return {
    cost: Number(food.price?.amount) || 0,
    costCurrency: food.price?.currency || null,
    energy: convertEnergy(
      Number(food.energy.amount) || 0,
      food.energy.unit,
      energyUnit,
    ),
    fat: Number(food.macronutrients.fat.amount) || 0,
    protein: Number(food.macronutrients.protein.amount) || 0,
    carbs: Number(food.macronutrients.carbs.amount) || 0,
  }
}

/**
 * `dominantCostCurrency` (see `foodCostCurrency`) restricts the Cost filter,
 * when active, to foods priced in that currency — comparing a threshold
 * against a cost in an unrelated currency would be meaningless. Every other
 * field ignores it.
 */
export function matchesFoodFilters(
  food: FoodDocument,
  filters: FoodFilters,
  dominantCostCurrency: string | null,
): boolean {
  const metrics = computeFoodMetrics(food, filters.energyUnit)

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
 * The currency to label and restrict the Cost filter to when foods mix
 * currencies: foods are grouped by currency, each group's prices are
 * summed, and the currency with the highest total wins.
 */
export function foodCostCurrency(foods: FoodDocument[]): string | null {
  const totals = new Map<string, number>()

  for (const food of foods) {
    const currency = food.price?.currency
    const amount = Number(food.price?.amount)
    if (!currency || Number.isNaN(amount)) continue
    totals.set(currency, (totals.get(currency) ?? 0) + amount)
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
