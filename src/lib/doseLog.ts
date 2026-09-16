import { doc, setDoc } from 'firebase/firestore'
import { db } from '../firebase.ts'
import { adjustDoseInventory } from './doseInventory.ts'
import { toDateStr } from './timeline.ts'
import type { DoseListItem, DoseLogDocument } from '../types/doses.ts'

/** Sets whether dose #`index` was taken today, writing the whole day's array to the deterministic `${doseId}_${date}` doc, and — when `dose` has a linked inventory batch — deducts (or restores, if this undoes a check) one unit from it. */
export async function setDoseTaken(
  uid: string,
  dose: DoseListItem,
  currentTaken: boolean[],
  index: number,
  checked: boolean,
): Promise<void> {
  const dosesPerDay = Math.max(1, Number(dose.dosesPerDay) || 1)
  const date = toDateStr(new Date())
  const next = Array.from(
    { length: dosesPerDay },
    (_, i) => currentTaken[i] ?? false,
  )
  const wasChecked = next[index] ?? false
  next[index] = checked

  const log: DoseLogDocument = { doseId: dose.id, date, taken: next }
  await setDoc(doc(db, 'users', uid, 'doseLogs', `${dose.id}_${date}`), log)

  if (wasChecked !== checked) {
    await adjustDoseInventory(uid, dose.inventoryBatchId, checked ? -1 : 1)
  }
}

/** Marks every dose slot taken for a specific (typically past) date — the missed-doses list's "Mark Taken" action, which resolves the whole day at once rather than needing per-slot granularity like today's checklist. Deducts one inventory unit (if `dose` has a linked batch) for each slot this newly marks taken — slots already taken beforehand aren't deducted again. */
export async function markDoseFullyTaken(
  uid: string,
  dose: DoseListItem,
  date: string,
  currentTaken: boolean[],
): Promise<void> {
  const dosesPerDay = Math.max(1, Number(dose.dosesPerDay) || 1)
  const newlyTakenCount = Array.from(
    { length: dosesPerDay },
    (_, i) => !(currentTaken[i] ?? false),
  ).filter(Boolean).length

  const log: DoseLogDocument = {
    doseId: dose.id,
    date,
    taken: Array(dosesPerDay).fill(true),
  }
  await setDoc(doc(db, 'users', uid, 'doseLogs', `${dose.id}_${date}`), log)

  if (newlyTakenCount > 0) {
    await adjustDoseInventory(uid, dose.inventoryBatchId, -newlyTakenCount)
  }
}

/** Dismisses a missed dose from the active list without erasing that it happened — writes `cleared: true` alongside whatever `taken` already stood at, so the doc remains a record of what was (and wasn't) taken that day, it just stops being surfaced as needing action. Never touches inventory — dismissing isn't claiming it was taken. */
export async function clearMissedDose(
  uid: string,
  doseId: string,
  date: string,
  currentTaken: boolean[],
): Promise<void> {
  const log: DoseLogDocument = {
    doseId,
    date,
    taken: currentTaken,
    cleared: true,
  }
  await setDoc(doc(db, 'users', uid, 'doseLogs', `${doseId}_${date}`), log)
}
