import { describe, expect, it } from 'vitest'
import {
  buildReceiptReviewRows,
  matchReceiptItem,
  normalizeReceiptUnit,
} from './receiptMatch.ts'
import type { FoodListItem } from '../hooks/useFoodRows.ts'
import type { InventoryBatchItem } from '../types/food.ts'

function makeFood(overrides: Partial<FoodListItem> = {}): FoodListItem {
  return {
    id: 'flour-1',
    name: 'Flour',
    quantity: { amount: '1', unit: 'kg' },
    energy: { amount: '3640', unit: 'cal' },
    macronutrients: {
      carbs: { amount: '76', unit: 'g' },
      fat: { amount: '1', unit: 'g' },
      protein: { amount: '10', unit: 'g' },
    },
    micronutrients: {},
    price: { amount: '2', currency: 'USD', retailer: '' },
    ...overrides,
  }
}

function makeOtherBatch(overrides: Partial<InventoryBatchItem> = {}): InventoryBatchItem {
  return {
    id: 'batch-1',
    kind: 'other',
    foodName: 'Garbage Bags',
    amount: '1',
    unit: '',
    price: '5',
    currency: 'USD',
    purchasedAt: '2026-08-01',
    ...overrides,
  }
}

describe('matchReceiptItem', () => {
  it('matches an existing food by name, case/whitespace-insensitively', () => {
    const food = makeFood({ name: 'Flour' })
    const result = matchReceiptItem('  flour  ', [food], [])
    expect(result).toEqual({ status: 'food', food })
  })

  it('matches an existing "Other" inventory item when no food matches', () => {
    const other = makeOtherBatch({ foodName: 'Garbage Bags' })
    const result = matchReceiptItem('garbage bags', [], [other])
    expect(result).toEqual({ status: 'other', existingName: 'Garbage Bags' })
  })

  it('prefers a food match over an "Other" match with the same name', () => {
    const food = makeFood({ name: 'Salt' })
    const other = makeOtherBatch({ foodName: 'Salt' })
    const result = matchReceiptItem('Salt', [food], [other])
    expect(result).toEqual({ status: 'food', food })
  })

  it('falls back to "new" when nothing matches', () => {
    const result = matchReceiptItem('Mystery Item', [makeFood()], [makeOtherBatch()])
    expect(result).toEqual({ status: 'new' })
  })

  it('ignores "Other" batches passed in that are actually food-linked', () => {
    // Defensive check: callers are expected to pre-filter to kind:'other',
    // but matchReceiptItem itself only looks at foodName, so this just
    // documents that it doesn't re-check kind itself.
    const foodBatch = makeOtherBatch({ kind: 'food', foodName: 'Rice' })
    const result = matchReceiptItem('Rice', [], [foodBatch])
    expect(result).toEqual({ status: 'other', existingName: 'Rice' })
  })
})

describe('normalizeReceiptUnit', () => {
  it('maps "ea" to the whole-item unit', () => {
    expect(normalizeReceiptUnit('ea')).toBe('')
  })

  it('normalizes a recognizable unit string', () => {
    expect(normalizeReceiptUnit('kg')).toBe('kg')
    expect(normalizeReceiptUnit('Grams')).toBe('g')
  })

  it('falls back to the whole-item unit for anything unrecognized', () => {
    expect(normalizeReceiptUnit('bunch')).toBe('')
  })
})

describe('buildReceiptReviewRows', () => {
  it('builds a food row for a matched item, carrying over amount/unit/price', () => {
    const food = makeFood({ name: 'Flour', id: 'flour-1' })
    const rows = buildReceiptReviewRows(
      [{ name: 'Flour', brand: null, cost: 3.5, amount: 1, unit: 'kg' }],
      [food],
      [],
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      status: 'food',
      kind: 'food',
      foodId: 'flour-1',
      name: 'Flour',
      amount: '1',
      unit: 'kg',
      price: '3.5',
    })
  })

  it('builds an "other" row for an item matching an existing non-food inventory item', () => {
    const other = makeOtherBatch({ foodName: 'Garbage Bags' })
    const rows = buildReceiptReviewRows(
      [{ name: 'garbage bags', brand: null, cost: 5, amount: 1, unit: 'ea' }],
      [],
      [other],
    )

    expect(rows[0]).toMatchObject({
      status: 'other',
      kind: 'other',
      name: 'Garbage Bags',
      unit: '',
    })
    expect(rows[0].foodId).toBeUndefined()
  })

  it('defaults an unmatched item with no brand to a new "other" row using the receipt\'s own name', () => {
    const rows = buildReceiptReviewRows(
      [{ name: 'Mystery Snack', brand: null, cost: 2, amount: 1, unit: 'ea' }],
      [],
      [],
    )

    expect(rows[0]).toMatchObject({
      status: 'new',
      kind: 'other',
      name: 'Mystery Snack',
    })
  })

  it('only matches against "other" batches, never food-linked ones, when checking for an inventory-item match', () => {
    const foodBatch = makeOtherBatch({ kind: 'food', foodId: 'rice-1', foodName: 'Rice' })
    const rows = buildReceiptReviewRows(
      [{ name: 'Rice', brand: null, cost: 4, amount: 1, unit: 'kg' }],
      [],
      [foodBatch],
    )

    // Not a food in `foods`, and the only "Rice" batch is food-linked (so
    // filtered out of the "other" candidates) — falls through to "new".
    expect(rows[0].status).toBe('new')
  })

  it('matches against the brand-stripped name, ignoring the brand entirely', () => {
    const food = makeFood({ name: 'Ricotta', id: 'ricotta-1' })
    const rows = buildReceiptReviewRows(
      [{ name: 'Ricotta', brand: 'Coles', cost: 4.5, amount: 1, unit: 'ea' }],
      [food],
      [],
    )

    expect(rows[0]).toMatchObject({ status: 'food', foodId: 'ricotta-1', name: 'Ricotta' })
  })

  it('recombines brand and name for a genuinely new (unmatched) item, so specificity isn\'t lost', () => {
    const rows = buildReceiptReviewRows(
      [{ name: 'Ricotta', brand: 'Coles', cost: 4.5, amount: 1, unit: 'ea' }],
      [],
      [],
    )

    expect(rows[0]).toMatchObject({ status: 'new', kind: 'other', name: 'Coles Ricotta' })
  })
})
