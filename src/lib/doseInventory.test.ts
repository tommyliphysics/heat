import { beforeEach, describe, expect, it } from 'vitest'
import { fakeUser, setCurrentUser } from '../test/authFake.ts'
import { readCollection, seedCollection } from '../test/firestoreFake.ts'
import { adjustDoseInventory } from './doseInventory.ts'
import type { InventoryBatchDocument } from '../types/food.ts'

const uid = 'test-uid'

function makeBatch(overrides: Partial<InventoryBatchDocument> = {}): InventoryBatchDocument {
  return {
    kind: 'other',
    foodName: 'Vitamin D',
    amount: '30',
    unit: '',
    price: '0',
    currency: 'USD',
    purchasedAt: '2026-08-01',
    remainingHistory: [{ amount: '30', timestamp: Date.now() }],
    ...overrides,
  }
}

function readBatch(id: string) {
  const batches = readCollection(`users/${uid}/inventory`) as unknown as (InventoryBatchDocument & {
    id: string
  })[]
  return batches.find((b) => b.id === id)
}

beforeEach(() => {
  setCurrentUser(fakeUser({ uid }))
})

describe('adjustDoseInventory', () => {
  it('deducts one from the linked batch when a dose is taken', async () => {
    seedCollection(`users/${uid}/inventory`, { 'batch-1': makeBatch() })

    await adjustDoseInventory(uid, 'batch-1', -1)

    const history = readBatch('batch-1')?.remainingHistory ?? []
    expect(history[history.length - 1].amount).toBe('29')
  })

  it('restores one when a check-off is undone', async () => {
    seedCollection(`users/${uid}/inventory`, {
      'batch-1': makeBatch({ remainingHistory: [{ amount: '29', timestamp: Date.now() }] }),
    })

    await adjustDoseInventory(uid, 'batch-1', 1)

    const history = readBatch('batch-1')?.remainingHistory ?? []
    expect(history[history.length - 1].amount).toBe('30')
  })

  it('never lets the count go below zero', async () => {
    seedCollection(`users/${uid}/inventory`, {
      'batch-1': makeBatch({ remainingHistory: [{ amount: '0', timestamp: Date.now() }] }),
    })

    await adjustDoseInventory(uid, 'batch-1', -1)

    const history = readBatch('batch-1')?.remainingHistory ?? []
    expect(history[history.length - 1].amount).toBe('0')
  })

  it('is a no-op when there is no linked inventory batch', async () => {
    await expect(adjustDoseInventory(uid, undefined, -1)).resolves.toBeUndefined()
    expect(readCollection(`users/${uid}/inventory`)).toEqual([])
  })

  it('is a no-op when delta is zero, even with a linked batch', async () => {
    seedCollection(`users/${uid}/inventory`, { 'batch-1': makeBatch() })

    await adjustDoseInventory(uid, 'batch-1', 0)

    const history = readBatch('batch-1')?.remainingHistory ?? []
    expect(history).toHaveLength(1)
  })

  it('is a no-op when the linked batch no longer exists', async () => {
    await expect(
      adjustDoseInventory(uid, 'deleted-batch', -1),
    ).resolves.toBeUndefined()
  })

  it('deducts multiple units at once (e.g. marking several missed slots taken)', async () => {
    seedCollection(`users/${uid}/inventory`, { 'batch-1': makeBatch() })

    await adjustDoseInventory(uid, 'batch-1', -3)

    const history = readBatch('batch-1')?.remainingHistory ?? []
    expect(history[history.length - 1].amount).toBe('27')
  })
})
