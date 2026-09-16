import { formatQuantity, toGrams, toMilliliters } from './units.ts'
import type { ShoppingListEntry } from './report.ts'
import type { QuantityUnit, ShoppingListItemDocument } from '../types/food.ts'

/** One row in the shopping list table — a computed (meal-derived) entry or a hand-added item, normalized to the same shape. */
export type ShoppingRow = {
  id: string
  name: string
  quantityLabel: string
  /** Single comparable magnitude for the "Amount" column sort — count if unit-less, else grams or milliliters. */
  quantityValue: number
  totalPrice: number
  currency: string
  custom: boolean
}

function quantityFromAmountUnit(amount: string, unit: QuantityUnit) {
  const totalGrams = toGrams(amount, unit)
  const totalMilliliters = toMilliliters(amount, unit)
  const totalCount = unit === '' ? Number(amount) || 0 : 0
  return { totalGrams, totalMilliliters, totalCount }
}

export function customItemToRow(
  item: ShoppingListItemDocument & { id: string },
): ShoppingRow {
  const quantity = quantityFromAmountUnit(item.amount, item.unit)
  return {
    id: item.id,
    name: item.name,
    quantityLabel: formatQuantity(quantity),
    quantityValue:
      quantity.totalCount || quantity.totalMilliliters || quantity.totalGrams,
    totalPrice: Number(item.price) || 0,
    currency: item.currency,
    custom: true,
  }
}

export function computedEntryToRow(entry: ShoppingListEntry): ShoppingRow {
  return {
    id: entry.foodId,
    name: entry.name,
    quantityLabel: formatQuantity(entry),
    quantityValue: entry.totalCount || entry.totalMilliliters || entry.totalGrams,
    totalPrice: entry.totalPrice,
    currency: entry.currency,
    custom: false,
  }
}
