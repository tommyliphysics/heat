import {
  buildFoodsMap,
  buildMealEntries,
  mealToRows,
  type FoodRow,
} from './foodRow.ts'
import type {
  FoodDocument,
  MealDocument,
  MealListItem,
  MealTime,
} from '../types/food.ts'

export type MealFoodRow = FoodRow

export type MealFormValues = {
  date: string
  time: MealTime
  rows: FoodRow[]
}

export const EMPTY_MEAL_FORM_VALUES: MealFormValues = {
  date: '',
  time: '',
  rows: [],
}

export function buildMealDocument(
  values: MealFormValues,
  currentFoods: Record<string, FoodDocument> = {},
  allMeals: MealListItem[] = [],
  excludeMealId: string | null = null,
): MealDocument {
  return {
    date: values.date,
    time: values.time,
    foods: buildFoodsMap(values.rows, currentFoods),
    entries: buildMealEntries(
      values.rows,
      allMeals,
      values.date,
      values.time,
      excludeMealId,
    ),
  }
}

export function mealDocumentToFormValues(
  record: MealDocument,
): MealFormValues {
  return {
    date: record.date,
    time: record.time,
    rows: mealToRows(record),
  }
}
