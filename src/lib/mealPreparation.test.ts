import { beforeEach, describe, expect, it } from 'vitest'
import { fakeUser, setCurrentUser } from '../test/authFake.ts'
import { readCollection, seedCollection } from '../test/firestoreFake.ts'
import {
  applyMealPreparedDeduction,
  inventoryChangesOnDate,
  latestChangeTimestamp,
} from './mealPreparation.ts'
import type { InventoryBatchDocument, InventoryBatchItem, MealDocument } from '../types/food.ts'

const uid = 'test-uid'

function makeBatch(
  id: string,
  overrides: Partial<InventoryBatchDocument> = {},
): InventoryBatchItem {
  return {
    id,
    foodId: 'flour-1',
    foodName: 'Flour',
    amount: '1000',
    unit: 'g',
    price: '2',
    currency: 'USD',
    purchasedAt: '2026-08-01',
    ...overrides,
  }
}

function seedBatch(batch: InventoryBatchItem) {
  const { id, ...data } = batch
  seedCollection(`users/${uid}/inventory`, { [id]: data })
}

function makeMeal(id: string, overrides: Partial<MealDocument> = {}) {
  seedCollection(`users/${uid}/meals`, {
    [id]: { date: '2026-08-03', time: 'dinner', foods: {}, ...overrides },
  })
}

function readBatch(id: string): InventoryBatchItem {
  const batches = readCollection(`users/${uid}/inventory`) as unknown as InventoryBatchItem[]
  return batches.find((b) => b.id === id)!
}

function readMeal(id: string) {
  const meals = readCollection(`users/${uid}/meals`) as unknown as (MealDocument & {
    id: string
  })[]
  return meals.find((m) => m.id === id)!
}

beforeEach(() => {
  setCurrentUser(fakeUser({ uid }))
})

describe('inventoryChangesOnDate / latestChangeTimestamp', () => {
  it('filters to entries on the given date, sorted oldest first, with fromAmount chained', () => {
    const t1 = new Date('2026-08-03T09:00:00').getTime()
    const t2 = new Date('2026-08-03T15:00:00').getTime()
    const t3 = new Date('2026-08-04T09:00:00').getTime()
    const batches = [
      makeBatch('batch-1', {
        amount: '1000',
        remainingHistory: [
          { amount: '800', timestamp: t1 },
          { amount: '600', timestamp: t2 },
          { amount: '500', timestamp: t3 },
        ],
      }),
    ]

    const events = inventoryChangesOnDate(batches, '2026-08-03')

    expect(events).toEqual([
      { batchId: 'batch-1', foodName: 'Flour', fromAmount: '1000', toAmount: '800', unit: 'g', timestamp: t1 },
      { batchId: 'batch-1', foodName: 'Flour', fromAmount: '800', toAmount: '600', unit: 'g', timestamp: t2 },
    ])
    expect(latestChangeTimestamp(batches, '2026-08-03')).toBe(t2)
  })

  it('returns null when there are no changes on that date', () => {
    const batches = [makeBatch('batch-1', { remainingHistory: [] })]
    expect(latestChangeTimestamp(batches, '2026-08-03')).toBeNull()
  })
})

describe('applyMealPreparedDeduction', () => {
  it('deducts the meal’s ingredients and marks it prepared when there is no prior change that day', async () => {
    seedBatch(makeBatch('batch-1', { purchasedAt: '2026-08-01' }))
    makeMeal('meal-1', {
      date: '2026-08-03',
      foods: {
        'flour-1': {
          name: 'Flour',
          quantity: { amount: '200', unit: 'g' },
          energy: { amount: '0', unit: 'cal' },
          macronutrients: {
            carbs: { amount: '0', unit: 'g' },
            fat: { amount: '0', unit: 'g' },
            protein: { amount: '0', unit: 'g' },
          },
          micronutrients: {},
          price: { amount: '0', currency: 'USD', retailer: '' },
        },
      },
      entries: [{ kind: 'food', foodId: 'flour-1', name: 'Flour' }],
    })

    const meal = readMeal('meal-1')
    const preparedAt = new Date('2026-08-03T18:00:00').getTime()

    const result = await applyMealPreparedDeduction(
      uid,
      meal,
      [readBatch('batch-1')],
      preparedAt,
    )

    expect(result).toEqual({ ok: true })
    const batch = readBatch('batch-1')
    expect(batch.remainingHistory).toEqual([
      { amount: '800', timestamp: preparedAt },
    ])
    expect(readMeal('meal-1').preparedDeductionAt).toBe(preparedAt)
  })

  it('refuses when the chosen time is at or before the last recorded change that day', async () => {
    const earlierChange = new Date('2026-08-03T20:00:00').getTime()
    seedBatch(
      makeBatch('batch-1', {
        purchasedAt: '2026-08-01',
        remainingHistory: [{ amount: '900', timestamp: earlierChange }],
      }),
    )
    makeMeal('meal-1', {
      date: '2026-08-03',
      foods: {
        'flour-1': {
          name: 'Flour',
          quantity: { amount: '200', unit: 'g' },
          energy: { amount: '0', unit: 'cal' },
          macronutrients: {
            carbs: { amount: '0', unit: 'g' },
            fat: { amount: '0', unit: 'g' },
            protein: { amount: '0', unit: 'g' },
          },
          micronutrients: {},
          price: { amount: '0', currency: 'USD', retailer: '' },
        },
      },
      entries: [{ kind: 'food', foodId: 'flour-1', name: 'Flour' }],
    })

    const meal = readMeal('meal-1')
    const attemptedAt = new Date('2026-08-03T18:00:00').getTime() // before earlierChange

    const result = await applyMealPreparedDeduction(
      uid,
      meal,
      [readBatch('batch-1')],
      attemptedAt,
    )

    expect(result.ok).toBe(false)
    // Unchanged — the refused attempt made no writes.
    expect(readBatch('batch-1').remainingHistory).toEqual([
      { amount: '900', timestamp: earlierChange },
    ])
    expect(readMeal('meal-1').preparedDeductionAt).toBeUndefined()
  })

  it('does not deduct a leftover-only recipe entry (handsOnTime "0")', async () => {
    seedBatch(makeBatch('batch-1', { purchasedAt: '2026-08-01' }))
    makeMeal('meal-1', {
      date: '2026-08-03',
      foods: {},
      entries: [
        {
          kind: 'recipe',
          recipeId: 'recipe-1',
          name: 'Bread',
          servings: '2',
          foods: [{ foodId: 'flour-1', name: 'Flour', amount: '200', unit: 'g' }],
          handsOnTime: '0',
        },
      ],
    })

    const meal = readMeal('meal-1')
    const result = await applyMealPreparedDeduction(
      uid,
      meal,
      [readBatch('batch-1')],
      new Date('2026-08-03T18:00:00').getTime(),
    )

    expect(result).toEqual({
      ok: false,
      reason: 'Nothing in this meal draws from inventory.',
    })
  })
})
