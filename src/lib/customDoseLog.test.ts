import { beforeEach, describe, expect, it } from 'vitest'
import { fakeUser, setCurrentUser } from '../test/authFake.ts'
import { readCollection, seedCollection } from '../test/firestoreFake.ts'
import { clearMissedCustomOccurrence, setCustomOccurrenceTaken } from './customDoseLog.ts'
import { occurrenceLogId } from './customSchedule.ts'
import type { CustomDoseLogDocument, DoseListItem } from '../types/doses.ts'
import type { InventoryBatchDocument } from '../types/food.ts'

const uid = 'test-uid'

function makeDose(overrides: Partial<DoseListItem> = {}): DoseListItem {
  return {
    id: 'dose-1',
    name: 'Vitamin D',
    dose: '1000 IU',
    dosesPerDay: '1',
    scheduleType: 'custom',
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

function readCustomLog(id: string): CustomDoseLogDocument | undefined {
  const logs = readCollection(`users/${uid}/customDoseLogs`) as unknown as (CustomDoseLogDocument & {
    id: string
  })[]
  return logs.find((l) => l.id === id)
}

beforeEach(() => {
  setCurrentUser(fakeUser({ uid }))
})

describe('setCustomOccurrenceTaken', () => {
  it('writes the occurrence log doc and deducts doseCount units from the linked batch', async () => {
    seedBatch('30')
    const dose = makeDose()

    await setCustomOccurrenceTaken(uid, dose, { entryId: 'entry-1', occurrenceIndex: 0, at: 1000, doseCount: 2 }, true)

    const id = occurrenceLogId('dose-1', 'entry-1', 0)
    expect(readCustomLog(id)).toMatchObject({
      doseId: 'dose-1',
      entryId: 'entry-1',
      occurrenceIndex: 0,
      scheduledAt: 1000,
      taken: true,
    })
    expect(latestBatchAmount()).toBe('28')
  })

  it('restores doseCount units when unchecking', async () => {
    seedBatch('28')
    const dose = makeDose()

    await setCustomOccurrenceTaken(uid, dose, { entryId: 'entry-1', occurrenceIndex: 0, at: 1000, doseCount: 2 }, false)

    expect(latestBatchAmount()).toBe('30')
  })

  it('does nothing to inventory for a dose with no linked batch', async () => {
    const dose = makeDose({ inventoryBatchId: undefined })

    await expect(
      setCustomOccurrenceTaken(uid, dose, { entryId: 'entry-1', occurrenceIndex: 0, at: 1000, doseCount: 1 }, true),
    ).resolves.toBeUndefined()
    expect(readCollection(`users/${uid}/inventory`)).toEqual([])
  })
})

describe('clearMissedCustomOccurrence', () => {
  it('writes cleared: true and leaves taken false, without touching inventory', async () => {
    seedBatch('30')

    await clearMissedCustomOccurrence(uid, 'dose-1', 'entry-1', 0, 1000)

    const id = occurrenceLogId('dose-1', 'entry-1', 0)
    expect(readCustomLog(id)).toMatchObject({ taken: false, cleared: true })
    expect(latestBatchAmount()).toBe('30')
  })
})
