import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeUser, setCurrentUser } from '../test/authFake.ts'
import { readCollection, seedCollection } from '../test/firestoreFake.ts'
import { markDoseFullyTaken, setDoseTaken } from './doseLog.ts'
import type { DoseListItem } from '../types/doses.ts'
import type { InventoryBatchDocument } from '../types/food.ts'

const uid = 'test-uid'

function makeDose(overrides: Partial<DoseListItem> = {}): DoseListItem {
  return {
    id: 'dose-1',
    name: 'Vitamin D',
    dose: '1000 IU',
    dosesPerDay: '1',
    inventoryBatchId: 'batch-1',
    ...overrides,
  }
}

function seedBatch(remaining: string) {
  const batch: InventoryBatchDocument = {
    kind: 'other',
    foodName: 'Vitamin D',
    amount: '30',
    unit: '',
    price: '0',
    currency: 'USD',
    purchasedAt: '2026-08-01',
    remainingHistory: [{ amount: remaining, timestamp: Date.now() }],
  }
  seedCollection(`users/${uid}/inventory`, { 'batch-1': batch })
}

function latestBatchAmount(): string | undefined {
  const batches = readCollection(`users/${uid}/inventory`) as unknown as (InventoryBatchDocument & {
    id: string
  })[]
  const history = batches.find((b) => b.id === 'batch-1')?.remainingHistory ?? []
  return history[history.length - 1]?.amount
}

beforeEach(() => {
  setCurrentUser(fakeUser({ uid }))
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-30T10:00:00'))
})

describe('setDoseTaken', () => {
  it('deducts one from the linked inventory when checking a dose taken', async () => {
    seedBatch('30')
    const dose = makeDose()

    await setDoseTaken(uid, dose, [], 0, true)

    expect(latestBatchAmount()).toBe('29')
  })

  it('restores one when unchecking a previously-taken dose', async () => {
    seedBatch('29')
    const dose = makeDose()

    await setDoseTaken(uid, dose, [true], 0, false)

    expect(latestBatchAmount()).toBe('30')
  })

  it('does not touch inventory when the checked state does not actually change', async () => {
    seedBatch('29')
    const dose = makeDose()

    await setDoseTaken(uid, dose, [true], 0, true)

    expect(latestBatchAmount()).toBe('29')
  })

  it('does nothing to inventory for a dose with no linked batch', async () => {
    const dose = makeDose({ inventoryBatchId: undefined })

    await expect(setDoseTaken(uid, dose, [], 0, true)).resolves.toBeUndefined()
    expect(readCollection(`users/${uid}/inventory`)).toEqual([])
  })
})

describe('markDoseFullyTaken', () => {
  it('deducts only the newly-taken slots, not ones already marked taken', async () => {
    seedBatch('30')
    const dose = makeDose({ dosesPerDay: '3' })

    // Slot 0 already taken; marking the day fully taken should only deduct
    // for slots 1 and 2 (2 units), not all 3.
    await markDoseFullyTaken(uid, dose, '2026-08-29', [true, false, false])

    expect(latestBatchAmount()).toBe('28')
  })

  it('deducts nothing when every slot was already taken', async () => {
    seedBatch('30')
    const dose = makeDose({ dosesPerDay: '2' })

    await markDoseFullyTaken(uid, dose, '2026-08-29', [true, true])

    expect(latestBatchAmount()).toBe('30')
  })
})
