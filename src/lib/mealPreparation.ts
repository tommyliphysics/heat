import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase.ts'
import {
  applyDayConsumption,
  dayConsumption,
  groupTier,
  personalTier,
  seedWorkingBatch,
  writeTouchedGroupBatches,
  writeTouchedPersonalBatches,
} from './inventoryReconcile.ts'
import { fetchGroupBatches, fetchUserGroupIds } from './groupInventory.ts'
import { toDateStr } from './timeline.ts'
import type { InventoryBatchItem, MealListItem, QuantityUnit } from '../types/food.ts'

export type InventoryChangeEvent = {
  batchId: string
  foodName: string
  fromAmount: string
  toAmount: string
  unit: QuantityUnit
  timestamp: number
}

/**
 * Every recorded inventory change (across every food/batch) whose timestamp
 * falls on `dateStr`, oldest first — what the "Mark as Prepared" timeline
 * plots. `fromAmount` is whatever the batch stood at immediately before
 * each entry (its own `amount` for a batch's very first entry).
 */
export function inventoryChangesOnDate(
  batches: InventoryBatchItem[],
  dateStr: string,
): InventoryChangeEvent[] {
  const events: InventoryChangeEvent[] = []

  for (const batch of batches) {
    const history = batch.remainingHistory ?? []
    for (let i = 0; i < history.length; i++) {
      const entry = history[i]
      if (toDateStr(new Date(entry.timestamp)) !== dateStr) continue

      events.push({
        batchId: batch.id,
        foodName: batch.foodName,
        fromAmount: i > 0 ? history[i - 1].amount : batch.amount,
        toAmount: entry.amount,
        unit: batch.unit,
        timestamp: entry.timestamp,
      })
    }
  }

  return events.sort((a, b) => a.timestamp - b.timestamp)
}

/** The most recent inventory change timestamp on `dateStr`, or `null` if none — the line a meal's prep time has to fall after. */
export function latestChangeTimestamp(
  batches: InventoryBatchItem[],
  dateStr: string,
): number | null {
  const events = inventoryChangesOnDate(batches, dateStr)
  return events.length > 0 ? events[events.length - 1].timestamp : null
}

export type MealPreparationResult =
  | { ok: true }
  | { ok: false; reason: string }

/**
 * Deducts `meal`'s ingredients from inventory right now, timestamped at
 * `preparedAt`, FIFO across each ingredient's batches purchased on or
 * before the meal's date — same matching rule and tiering (this account's
 * own batches, then each group's, by name+brand — see
 * `lib/inventoryReconcile.ts`'s `personalTier`/`groupTier`) as the
 * automatic end-of-day catch-up, just triggered immediately instead of
 * waiting for the day to fully elapse. `batches` is this account's own
 * personal inventory only — group batches are fetched here directly, the
 * same self-contained way `reconcileInventory` does.
 *
 * Refuses if `preparedAt` isn't after every inventory change already
 * recorded on the meal's date: history entries are append-only and kept in
 * chronological order (see `InventoryRemainingEntry`), so there's no clean
 * way to insert a deduction earlier than one that's already been recorded
 * after it. Pick a later time, or let the automatic end-of-day catch-up
 * handle it once the day elapses. (This check only looks at the account's
 * own personal batches, not group ones — a narrower guard than ideal, but
 * matches what's cheaply available here without an extra fetch just for a
 * timing heuristic.)
 */
export async function applyMealPreparedDeduction(
  uid: string,
  meal: MealListItem,
  batches: InventoryBatchItem[],
  preparedAt: number,
): Promise<MealPreparationResult> {
  const lastChange = latestChangeTimestamp(batches, meal.date)
  if (lastChange !== null && preparedAt <= lastChange) {
    return {
      ok: false,
      reason:
        'That time is at or before an inventory change already recorded that day — pick a later time.',
    }
  }

  const consumption = dayConsumption([meal])
  if (consumption.size === 0) {
    return { ok: false, reason: 'Nothing in this meal draws from inventory.' }
  }

  const personalBatches = batches.map((batch) =>
    seedWorkingBatch(batch, ['users', uid, 'inventory']),
  )

  const groupIds = await fetchUserGroupIds(uid)
  const groupBatchLists = await Promise.all(
    groupIds.map(async (groupId) => {
      const groupBatches = await fetchGroupBatches(groupId)
      return groupBatches.map((batch) =>
        seedWorkingBatch(batch, ['groups', groupId, 'inventory']),
      )
    }),
  )

  const tiers = [
    personalTier(personalBatches),
    ...groupBatchLists.map((groupBatches) => groupTier(groupBatches)),
  ]
  applyDayConsumption(meal.date, consumption, tiers, preparedAt)

  await Promise.all([
    ...writeTouchedPersonalBatches(personalBatches, false),
    ...groupBatchLists.flatMap((groupBatches) =>
      writeTouchedGroupBatches(groupBatches, preparedAt),
    ),
    updateDoc(doc(db, 'users', uid, 'meals', meal.id), {
      preparedDeductionAt: preparedAt,
    }),
  ])

  return { ok: true }
}
