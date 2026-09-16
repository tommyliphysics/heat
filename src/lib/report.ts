import { toCalories, toGrams, toMilligrams, toMilliliters } from './units.ts'
import type { EnergyUnit, MealDocument } from '../types/food.ts'

export type ShoppingListEntry = {
  foodId: string
  name: string
  totalGrams: number
  totalMilliliters: number
  totalCount: number
  totalPrice: number
  currency: string
}

export type MicronutrientAverage = {
  name: string
  amountMg: number
}

export type ReportData = {
  days: number
  avgCaloriesPerDay: number
  energyUnitsInUse: EnergyUnit[]
  dominantEnergyUnit: EnergyUnit
  avgCostPerDay: number
  costCurrency: string | null
  shoppingList: ShoppingListEntry[]
  avgCarbs: number
  avgFat: number
  avgProtein: number
  micronutrients: MicronutrientAverage[]
  totalHandsOnMinutes: number
}

/** Total hands-on time (minutes) across a meal's recipe entries — standalone foods have none. */
export function mealHandsOnMinutes(meal: MealDocument): number {
  let total = 0
  for (const entry of meal.entries ?? []) {
    if (entry.kind === 'recipe') total += Number(entry.handsOnTime) || 0
  }
  return total
}

export function computeReport(meals: MealDocument[], days: number): ReportData {
  let totalCalories = 0
  let totalCost = 0
  let totalCarbs = 0
  let totalFat = 0
  let totalProtein = 0
  let totalHandsOnMinutes = 0
  const currencies = new Set<string>()
  const energyUnits = new Set<EnergyUnit>()
  const caloriesByEnergyUnit = new Map<EnergyUnit, number>()
  const microMap = new Map<string, number>()
  const shoppingMap = new Map<
    string,
    {
      name: string
      totalGrams: number
      totalMilliliters: number
      totalCount: number
      totalPrice: number
      currency: string
    }
  >()

  for (const meal of meals) {
    totalHandsOnMinutes += mealHandsOnMinutes(meal)

    for (const [foodId, food] of Object.entries(meal.foods ?? {})) {
      const calories = toCalories(food.energy.amount, food.energy.unit)
      totalCalories += calories
      if (food.energy.unit) {
        energyUnits.add(food.energy.unit)
        caloriesByEnergyUnit.set(
          food.energy.unit,
          (caloriesByEnergyUnit.get(food.energy.unit) ?? 0) + calories,
        )
      }

      const price = Number(food.price.amount)
      const safePrice = Number.isNaN(price) ? 0 : price
      totalCost += safePrice
      if (food.price.currency) currencies.add(food.price.currency)

      totalCarbs += Number(food.macronutrients.carbs.amount) || 0
      totalFat += Number(food.macronutrients.fat.amount) || 0
      totalProtein += Number(food.macronutrients.protein.amount) || 0

      for (const [microName, micro] of Object.entries(
        food.micronutrients ?? {},
      )) {
        const mg = toMilligrams(micro.amount, micro.unit)
        microMap.set(microName, (microMap.get(microName) ?? 0) + mg)
      }

      const grams = toGrams(food.quantity.amount, food.quantity.unit)
      const milliliters = toMilliliters(
        food.quantity.amount,
        food.quantity.unit,
      )
      const count =
        food.quantity.unit === '' ? Number(food.quantity.amount) || 0 : 0
      const existing = shoppingMap.get(foodId)
      if (existing) {
        existing.totalGrams += grams
        existing.totalMilliliters += milliliters
        existing.totalCount += count
        existing.totalPrice += safePrice
      } else {
        shoppingMap.set(foodId, {
          name: food.name,
          totalGrams: grams,
          totalMilliliters: milliliters,
          totalCount: count,
          totalPrice: safePrice,
          currency: food.price.currency,
        })
      }
    }
  }

  const safeDays = days || 1

  let dominantEnergyUnit: EnergyUnit = 'cal'
  let bestUnitCalories = -Infinity
  for (const [unit, calories] of caloriesByEnergyUnit) {
    if (calories > bestUnitCalories) {
      bestUnitCalories = calories
      dominantEnergyUnit = unit
    }
  }

  return {
    days,
    avgCaloriesPerDay: totalCalories / safeDays,
    energyUnitsInUse: [...energyUnits],
    dominantEnergyUnit,
    avgCostPerDay: totalCost / safeDays,
    costCurrency: currencies.size === 1 ? [...currencies][0] : null,
    shoppingList: [...shoppingMap.entries()].map(([foodId, entry]) => ({
      foodId,
      ...entry,
    })),
    avgCarbs: totalCarbs / safeDays,
    avgFat: totalFat / safeDays,
    avgProtein: totalProtein / safeDays,
    micronutrients: [...microMap.entries()].map(([name, totalMg]) => ({
      name,
      amountMg: totalMg / safeDays,
    })),
    totalHandsOnMinutes,
  }
}
