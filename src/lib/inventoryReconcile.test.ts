import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeUser, setCurrentUser } from '../test/authFake.ts'
import { readCollection, seedCollection } from '../test/firestoreFake.ts'
import {
  getInventoryReconciledThrough,
  setInventoryReconciledThrough,
} from './settings.ts'
import { reconcileInventory } from './inventoryReconcile.ts'
import type { FoodDocument, InventoryBatchDocument, MealDocument } from '../types/food.ts'

const uid = 'test-uid'

function makeFood(overrides: Partial<FoodDocument> = {}): FoodDocument {
  return {
    name: 'Flour',
    quantity: { amount: '1', unit: 'kg' },
    energy: { amount: '3640', unit: 'cal' },
    macronutrients: {
      carbs: { amount: '76', unit: 'g' },
      fat: { amount: '1', unit: 'g' },
      protein: { amount: '10', unit: 'g' },
    },
    micronutrients: {},
    price: { amount: '2', currency: 'USD', retailer: 'Store' },
    ...overrides,
  }
}

function makeBatch(overrides: Partial<InventoryBatchDocument> = {}): InventoryBatchDocument {
  return {
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

function seedBatch(id: string, overrides: Partial<InventoryBatchDocument> = {}) {
  seedCollection(`users/${uid}/inventory`, { [id]: makeBatch(overrides) })
}

function makeMeal(overrides: Partial<MealDocument> = {}): MealDocument {
  return {
    date: '2026-08-03',
    time: 'dinner',
    foods: {},
    ...overrides,
  }
}

function seedMeal(id: string, overrides: Partial<MealDocument> = {}) {
  seedCollection(`users/${uid}/meals`, { [id]: makeMeal(overrides) })
}

function latestOf(batchId: string): { amount: string; timestamp: number } | undefined {
  const batches = readCollection(`users/${uid}/inventory`) as unknown as (InventoryBatchDocument & {
    id: string
  })[]
  const batch = batches.find((b) => b.id === batchId)
  const history = batch?.remainingHistory ?? []
  return history[history.length - 1]
}

beforeEach(() => {
  setCurrentUser(fakeUser({ uid }))
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-04T10:00:00'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('reconcileInventory', () => {
  it('decrements the batch based on a plain food entry meal on an elapsed day', async () => {
    seedBatch('batch-1', { purchasedAt: '2026-08-01' })
    seedMeal('meal-1', {
      date: '2026-08-03',
      foods: { 'flour-1': makeFood({ quantity: { amount: '200', unit: 'g' } }) },
      entries: [{ kind: 'food', foodId: 'flour-1', name: 'Flour' }],
    })

    await reconcileInventory(uid)

    expect(latestOf('batch-1')?.amount).toBe('800')
    expect(await getInventoryReconciledThrough(uid)).toBe('2026-08-03')
  })

  it('falls through to the next batch (FIFO, oldest purchased first) once one is exhausted', async () => {
    seedCollection(`users/${uid}/inventory`, {
      'batch-old': makeBatch({ purchasedAt: '2026-07-01', amount: '100' }),
      'batch-new': makeBatch({ purchasedAt: '2026-07-15', amount: '1000' }),
    })
    seedMeal('meal-1', {
      date: '2026-08-03',
      foods: { 'flour-1': makeFood({ quantity: { amount: '300', unit: 'g' } }) },
      entries: [{ kind: 'food', foodId: 'flour-1', name: 'Flour' }],
    })

    await reconcileInventory(uid)

    expect(latestOf('batch-old')?.amount).toBe('0')
    expect(latestOf('batch-new')?.amount).toBe('800')
  })

  it('never draws from a batch purchased after the day being reconciled', async () => {
    seedCollection(`users/${uid}/inventory`, {
      'batch-future': makeBatch({ purchasedAt: '2026-08-03', amount: '1000' }),
    })
    seedMeal('meal-1', {
      date: '2026-08-02',
      foods: { 'flour-1': makeFood({ quantity: { amount: '200', unit: 'g' } }) },
      entries: [{ kind: 'food', foodId: 'flour-1', name: 'Flour' }],
    })

    await reconcileInventory(uid)

    // 2026-08-02's meal predates the batch's 2026-08-03 purchase — untouched.
    expect(latestOf('batch-future')).toBeUndefined()
  })

  it('does not decrement for a recipe entry marked as eating an already-cooked leftover', async () => {
    seedBatch('batch-1', { purchasedAt: '2026-08-01' })
    seedMeal('meal-1', {
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

    await reconcileInventory(uid)

    expect(latestOf('batch-1')).toBeUndefined()
  })

  it('decrements for a fresh (non-leftover) recipe entry, using its own scaled ingredient list', async () => {
    seedBatch('batch-1', { purchasedAt: '2026-08-01' })
    seedMeal('meal-1', {
      date: '2026-08-03',
      foods: {},
      entries: [
        {
          kind: 'recipe',
          recipeId: 'recipe-1',
          name: 'Bread',
          servings: '2',
          foods: [{ foodId: 'flour-1', name: 'Flour', amount: '250', unit: 'g' }],
          handsOnTime: '30',
        },
      ],
    })

    await reconcileInventory(uid)

    expect(latestOf('batch-1')?.amount).toBe('750')
  })

  it('only reconciles yesterday on a user’s first-ever run, not their whole meal history', async () => {
    seedBatch('batch-1', { purchasedAt: '2026-01-01', amount: '1000' })
    // An old meal, long before "yesterday" (2026-08-03) — should be ignored
    // on this first run.
    seedMeal('meal-old', {
      date: '2026-02-01',
      foods: { 'flour-1': makeFood({ quantity: { amount: '500', unit: 'g' } }) },
      entries: [{ kind: 'food', foodId: 'flour-1', name: 'Flour' }],
    })
    seedMeal('meal-yesterday', {
      date: '2026-08-03',
      foods: { 'flour-1': makeFood({ quantity: { amount: '100', unit: 'g' } }) },
      entries: [{ kind: 'food', foodId: 'flour-1', name: 'Flour' }],
    })

    await reconcileInventory(uid)

    expect(latestOf('batch-1')?.amount).toBe('900')
  })

  it('is idempotent — running twice in a row only decrements once', async () => {
    seedBatch('batch-1', { purchasedAt: '2026-08-01' })
    seedMeal('meal-1', {
      date: '2026-08-03',
      foods: { 'flour-1': makeFood({ quantity: { amount: '200', unit: 'g' } }) },
      entries: [{ kind: 'food', foodId: 'flour-1', name: 'Flour' }],
    })

    await reconcileInventory(uid)
    await reconcileInventory(uid)

    expect(latestOf('batch-1')?.amount).toBe('800')
  })

  it('catches up on every elapsed day since the last reconciled date, oldest first', async () => {
    seedBatch('batch-1', { purchasedAt: '2026-08-01', amount: '1000' })
    await setInventoryReconciledThrough(uid, '2026-08-01')
    seedMeal('meal-2', {
      date: '2026-08-02',
      foods: { 'flour-1': makeFood({ quantity: { amount: '100', unit: 'g' } }) },
      entries: [{ kind: 'food', foodId: 'flour-1', name: 'Flour' }],
    })
    seedMeal('meal-3', {
      date: '2026-08-03',
      foods: { 'flour-1': makeFood({ quantity: { amount: '50', unit: 'g' } }) },
      entries: [{ kind: 'food', foodId: 'flour-1', name: 'Flour' }],
    })

    await reconcileInventory(uid)

    const batches = readCollection(`users/${uid}/inventory`) as unknown as (InventoryBatchDocument & {
      id: string
    })[]
    const history = batches[0].remainingHistory ?? []
    // The batch started with no history at all (a legacy batch, in this
    // test's terms) — its first-ever write includes a synthetic baseline
    // entry ('1000', the full purchased amount) ahead of the two real
    // changes, so the persisted history is self-contained rather than
    // starting abruptly mid-sequence.
    expect(history.map((h) => h.amount)).toEqual(['1000', '900', '850'])
  })
})
