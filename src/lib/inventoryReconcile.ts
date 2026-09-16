import {
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  where,
  updateDoc,
} from 'firebase/firestore'
import { db } from '../firebase.ts'
import {
  getInventoryReconciledThrough,
  setInventoryReconciledThrough,
} from './settings.ts'
import { baseQuantity, fromBaseQuantity, latestRemaining, legacyOrFullAmount } from './inventory.ts'
import { normalizedFoodKey } from './food.ts'
import { fetchGroupBatches, fetchUserGroupIds } from './groupInventory.ts'
import { addDays, parseDateStr, toDateStr } from './timeline.ts'
import type {
  InventoryBatchDocument,
  InventoryBatchItem,
  InventoryRemainingEntry,
  MealListItem,
  QuantityUnit,
} from '../types/food.ts'

/** Local noon of `dateStr`, so an auto-decrement history entry reads as "here's what changed, and on which day" rather than carrying the real (arbitrary, whenever-the-app-happened-to-open) time the catch-up ran. */
function middayTimestamp(dateStr: string): number {
  return parseDateStr(dateStr).getTime() + 12 * 60 * 60 * 1000
}

/** One day's total demand for one food — `name`/`brand` travel alongside the amount because group-inventory batches (see `groupTier` below) are matched to a member's meal by name+brand, not by `foodId`, which differs across members' independently-created food records for "the same" product. */
export type FoodConsumption = { amount: number; name: string; brand?: string }

/**
 * foodId -> total base-unit amount actually drawn from stock across every
 * meal dated `dateStr`, alongside that food's name/brand for group-inventory
 * matching. Mirrors `buildFoodsMap` (`lib/foodRow.ts`), except a recipe
 * entry whose `handsOnTime` is exactly `'0'` is skipped entirely — it means
 * that entry ate an already-cooked leftover batch rather than cooking fresh
 * (see `resolveLeftoverEntry` in `lib/leftovers.ts`), so it draws on
 * inventory that was already decremented on the original cook day, not
 * again here. A meal with `preparedDeductionAt` set is skipped in full —
 * its ingredients were already deducted via the manual "Mark as Prepared"
 * flow (`lib/mealPreparation.ts`), so counting it again here would double
 * it.
 */
export function dayConsumption(meals: MealListItem[]): Map<string, FoodConsumption> {
  const consumption = new Map<string, FoodConsumption>()

  function add(
    foodId: string | undefined,
    amount: string,
    unit: QuantityUnit,
    name: string | undefined,
    brand: string | undefined,
  ) {
    if (!foodId || !name) return
    const base = baseQuantity(amount, unit)
    const existing = consumption.get(foodId)
    consumption.set(foodId, { amount: (existing?.amount ?? 0) + base, name, brand })
  }

  for (const meal of meals) {
    if (meal.preparedDeductionAt) continue

    const foods = meal.foods ?? {}
    const entries = meal.entries

    if (!entries) {
      // Meal saved before per-entry tracking existed — no leftover concept
      // applies, so its whole flattened `foods` map counts as fresh.
      for (const [foodId, food] of Object.entries(foods)) {
        add(foodId, food.quantity.amount, food.quantity.unit, food.name, food.brand)
      }
      continue
    }

    for (const entry of entries) {
      if (entry.kind === 'food') {
        const food = foods[entry.foodId]
        if (food) {
          add(entry.foodId, food.quantity.amount, food.quantity.unit, food.name, food.brand)
        }
        continue
      }

      // "0" hands-on time means this entry ate an already-cooked batch
      // rather than cooking fresh — no new ingredients drawn today.
      if (entry.handsOnTime === '0') continue

      // `entry.foods` is already the recipe's ingredient list scaled to
      // this entry's own servings (see `buildMealEntries`), whether it
      // came from the live recipe or a per-meal `customFoods` override —
      // no need to re-fetch the recipe or redo the ratio math here. It
      // doesn't carry `brand` itself, so that's looked up from the meal's
      // aggregate `foods` map instead, keyed by the same `foodId`.
      for (const food of entry.foods) {
        add(food.foodId, food.amount, food.unit, food.name, foods[food.foodId]?.brand)
      }
    }
  }

  return consumption
}

export type WorkingBatch = InventoryBatchItem & {
  workingHistory: InventoryRemainingEntry[]
  /** True once at least one real decrement has been pushed onto `workingHistory` — distinguishes an actually-touched batch from one that merely got the in-memory seed entry for FIFO math but was never drawn from, so an untouched legacy batch (no `remainingHistory` yet) doesn't get a spurious write. */
  touched: boolean
  /** False when `workingHistory[0]` is a synthetic seed (see `seedWorkingBatch`) rather than a real, previously-persisted entry — `writeTouchedPersonalBatches` uses this to decide whether that seed belongs in what actually gets written. */
  hadRealHistory: boolean
  /** Firestore path segments to this batch's own parent collection — `['users', uid, 'inventory']` for a personal batch, `['groups', groupId, 'inventory']` for a group's. Lets the write-back step target the right document regardless of which tier supplied the batch — see `personalTier`/`groupTier`. */
  basePath: string[]
}

/**
 * One pool of batches plus the rule for whether a given batch covers a
 * given day's demand for a foodId. `applyDayConsumption` draws from tiers
 * in order, each fully before moving to the next — see `reconcileInventory`
 * for why personal batches come first.
 */
export type BatchTier = {
  batches: WorkingBatch[]
  matches: (batch: WorkingBatch, foodId: string, demand: FoodConsumption) => boolean
}

/** A personal batch covers a food by the exact `foodId` its own account's meal references — same identity, same account. */
export function personalTier(batches: WorkingBatch[]): BatchTier {
  return { batches, matches: (batch, foodId) => batch.foodId === foodId }
}

/**
 * A group's shared batch covers a member's meal by name+brand, not
 * `foodId` — each member's food records are independently created with
 * their own ids, so two members' "Milk [Sunrice]" are different `foodId`s
 * but, by the no-duplicate-name+brand rule (`findDuplicateFood`), the same
 * (name, brand) pair. `'other'` batches (no `foodId`, no name/brand
 * identity of their own beyond a free-typed label) never match a meal this
 * way — they're only ever adjusted manually.
 */
export function groupTier(batches: WorkingBatch[]): BatchTier {
  return {
    batches,
    matches: (batch, _foodId, demand) =>
      !!batch.foodId &&
      normalizedFoodKey(batch.foodName, batch.brand) === normalizedFoodKey(demand.name, demand.brand),
  }
}

/**
 * Walks `consumption` against every tier in order (personal batches fully
 * before any group's), decrementing each covered batch's in-memory
 * `workingHistory` (never below 0) — mutates the tiers' batches in place.
 * Batches purchased after `dateStr` are skipped; leftover unmet demand
 * beyond available stock is simply not recorded, same as a manual edit
 * hitting 0 already behaves.
 */
export function applyDayConsumption(
  dateStr: string,
  consumption: Map<string, FoodConsumption>,
  tiers: BatchTier[],
  timestamp: number = middayTimestamp(dateStr),
): void {
  for (const [foodId, demand] of consumption) {
    let remainingNeed = demand.amount

    for (const tier of tiers) {
      if (remainingNeed <= 0) break

      const eligible = tier.batches
        .filter((batch) => batch.purchasedAt <= dateStr && tier.matches(batch, foodId, demand))
        .sort(
          (a, b) => a.purchasedAt.localeCompare(b.purchasedAt) || a.id.localeCompare(b.id),
        )

      for (const batch of eligible) {
        if (remainingNeed <= 0) break

        const current = batch.workingHistory[batch.workingHistory.length - 1]
        const currentBase = baseQuantity(current.amount, batch.unit)
        if (currentBase <= 0) continue

        const used = Math.min(currentBase, remainingNeed)
        const nextBase = currentBase - used
        batch.workingHistory.push({
          amount: String(fromBaseQuantity(nextBase, batch.unit)),
          timestamp,
        })
        batch.touched = true
        remainingNeed -= used
      }
    }
  }
}

export function seedWorkingBatch(batch: InventoryBatchItem, basePath: string[]): WorkingBatch {
  const hadRealHistory = !!batch.remainingHistory && batch.remainingHistory.length > 0

  // Anchored at the batch's own purchase date (not `Date.now()`) so this
  // seed always sorts before every day-based entry this run adds after
  // it — every one of those is on or after `purchasedAt` by construction
  // (see `applyDayConsumption`'s own purchasedAt filter), whereas "right
  // now" could easily be later in wall-clock time than an elapsed day
  // this same run is about to backdate a noon-stamped entry onto.
  const seed: InventoryRemainingEntry[] = hadRealHistory
    ? batch.remainingHistory!
    : [
        {
          amount: legacyOrFullAmount(batch),
          timestamp: middayTimestamp(batch.purchasedAt),
        },
      ]
  return { ...batch, workingHistory: [...seed], touched: false, hadRealHistory, basePath }
}

/**
 * Writes a group batch's total consumption for this run as a single
 * transactional delta against whatever the batch's remaining amount
 * actually is *right now* — never the value this run's in-memory
 * simulation started from, which may be stale by the time this commits if
 * another member's own session is reconciling concurrently against the
 * same shared batch. This is the only place a race between two members'
 * sessions is possible (each member's own meals/personal batches are only
 * ever touched by that member's own session), so it's the only write that
 * needs transactional re-basing rather than a plain `updateDoc`. Folding
 * several elapsed days into one entry (instead of one per day, like
 * personal batches keep) is an accepted, minor fidelity trade for that
 * safety — group batches are a new feature with no prior history to match.
 */
export async function applyGroupBatchDelta(
  basePath: string[],
  batchId: string,
  usedBase: number,
  unit: QuantityUnit,
  timestamp: number,
): Promise<void> {
  if (usedBase <= 0) return

  await runTransaction(db, async (transaction) => {
    // A joined path, not `...basePath` spread — see `InventoryBatchTable.tsx`'s
    // `batchDocRef` comment for why spreading a plain `string[]` into `doc()`
    // picks the wrong overload.
    const ref = doc(db, [...basePath, batchId].join('/'))
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists()) return
    const batch = snapshot.data() as InventoryBatchDocument

    const currentBase = baseQuantity(latestRemaining(batch), unit)
    const nextBase = Math.max(0, currentBase - usedBase)

    transaction.update(ref, {
      remainingHistory: [
        ...(batch.remainingHistory ?? []),
        { amount: String(fromBaseQuantity(nextBase, unit)), timestamp },
      ],
    })
  })
}

/**
 * Plain `updateDoc`s for whichever personal batches got touched — no
 * transaction needed, since only the account that owns them ever writes to
 * them.
 *
 * `materializeSeed` controls what happens to a batch that had no real
 * `remainingHistory` yet: `reconcileInventory`'s multi-day catch-up wants
 * its synthetic seed (see `seedWorkingBatch`) turned into a real, dated
 * first entry, so the persisted history reads accurately from the start —
 * `true` here. `applyMealPreparedDeduction`'s immediate single-action path
 * has always instead appended only the entries this run actually added,
 * leaving a batch with no prior history still empty apart from that new
 * entry — pass `false` there to preserve that contract.
 */
export function writeTouchedPersonalBatches(
  batches: WorkingBatch[],
  materializeSeed = true,
): Promise<void>[] {
  return batches
    .filter((batch) => batch.touched)
    .map((batch) => {
      const historyToWrite =
        materializeSeed || batch.hadRealHistory
          ? batch.workingHistory
          : batch.workingHistory.slice(1)
      return updateDoc(doc(db, [...batch.basePath, batch.id].join('/')), {
        remainingHistory: historyToWrite,
      })
    })
}

/** Transactional delta writes (see `applyGroupBatchDelta`) for whichever group batches got touched during this run's in-memory simulation. */
export function writeTouchedGroupBatches(
  batches: WorkingBatch[],
  timestamp: number,
): Promise<void>[] {
  return batches
    .filter((batch) => batch.touched)
    .map((batch) => {
      const seedBase = baseQuantity(
        batch.remainingHistory && batch.remainingHistory.length > 0
          ? latestRemaining(batch)
          : legacyOrFullAmount(batch),
        batch.unit,
      )
      const finalBase = baseQuantity(
        batch.workingHistory[batch.workingHistory.length - 1].amount,
        batch.unit,
      )
      return applyGroupBatchDelta(
        batch.basePath,
        batch.id,
        seedBase - finalBase,
        batch.unit,
        timestamp,
      )
    })
}

/**
 * Catches up a user's inventory — personal AND every group they belong to
 * — on every local calendar day of meal consumption since the last time
 * this ran for them, using whatever's already planned in the Calendar (see
 * `getInventoryReconciledThrough`). Meant to run once per app session,
 * right after login (see `AuthenticatedShell.tsx`); safe to call
 * repeatedly, since it no-ops once caught up. A user's very first run only
 * reconciles yesterday, not their entire meal history, so this can't
 * produce a surprise mass-decrement the first time it sees an existing
 * account.
 *
 * Demand is covered from the user's own personal batches first, then from
 * each group they belong to (see `personalTier`/`groupTier`) — this always
 * only ever reads/computes from *this user's own* meals and personal
 * batches, deliberately: a group's shared batches get contributed to
 * independently by each member's own session as they log in, rather than
 * this function ever needing to read another member's private meals or
 * inventory to compute a pooled total up front. The only cross-member
 * concern is two members' sessions writing to the *same* group batch
 * around the same time, which `applyGroupBatchDelta`'s transaction handles.
 */
export async function reconcileInventory(uid: string): Promise<void> {
  const todayStr = toDateStr(new Date())
  const lastElapsedDay = addDays(todayStr, -1)

  const reconciledThrough = await getInventoryReconciledThrough(uid)
  const startDay = reconciledThrough ? addDays(reconciledThrough, 1) : lastElapsedDay

  if (startDay > lastElapsedDay) return // already caught up

  const [mealsSnapshot, batchesSnapshot, groupIds] = await Promise.all([
    getDocs(
      query(
        collection(db, 'users', uid, 'meals'),
        where('date', '>=', startDay),
        where('date', '<=', lastElapsedDay),
      ),
    ),
    getDocs(collection(db, 'users', uid, 'inventory')),
    fetchUserGroupIds(uid),
  ])

  const mealsByDate = new Map<string, MealListItem[]>()
  for (const mealSnap of mealsSnapshot.docs) {
    const meal = { id: mealSnap.id, ...mealSnap.data() } as MealListItem
    const list = mealsByDate.get(meal.date) ?? []
    list.push(meal)
    mealsByDate.set(meal.date, list)
  }

  const personalBatches = batchesSnapshot.docs.map((batchSnap) =>
    seedWorkingBatch(
      { id: batchSnap.id, ...batchSnap.data() } as InventoryBatchItem,
      ['users', uid, 'inventory'],
    ),
  )

  const groupBatchLists = await Promise.all(
    groupIds.map(async (groupId) => {
      const batches = await fetchGroupBatches(groupId)
      return batches.map((batch) => seedWorkingBatch(batch, ['groups', groupId, 'inventory']))
    }),
  )

  const tiers: BatchTier[] = [
    personalTier(personalBatches),
    ...groupBatchLists.map((batches) => groupTier(batches)),
  ]

  let day = startDay
  while (day <= lastElapsedDay) {
    const consumption = dayConsumption(mealsByDate.get(day) ?? [])
    if (consumption.size > 0) applyDayConsumption(day, consumption, tiers)
    day = addDays(day, 1)
  }

  const personalWrites = writeTouchedPersonalBatches(personalBatches)
  const groupWrites = groupBatchLists.flatMap((batches) =>
    writeTouchedGroupBatches(batches, middayTimestamp(lastElapsedDay)),
  )

  await Promise.all([...personalWrites, ...groupWrites])

  await setInventoryReconciledThrough(uid, lastElapsedDay)
}
