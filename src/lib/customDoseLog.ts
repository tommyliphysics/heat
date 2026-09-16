import { doc, setDoc } from 'firebase/firestore'
import { db } from '../firebase.ts'
import { adjustDoseInventory } from './doseInventory.ts'
import { occurrenceLogId, type ScheduledOccurrence } from './customSchedule.ts'
import type { CustomDoseLogDocument, DoseListItem } from '../types/doses.ts'

/** Sets whether one custom-schedule occurrence was taken, writing to its deterministic `customDoseLogs` doc, and — when `dose` has a linked inventory batch — deducts (or restores, if this undoes a check) `occurrence.doseCount` units from it, since a custom occurrence can represent more than one dose-unit at once. */
export async function setCustomOccurrenceTaken(
  uid: string,
  dose: DoseListItem,
  occurrence: ScheduledOccurrence,
  checked: boolean,
): Promise<void> {
  const log: CustomDoseLogDocument = {
    doseId: dose.id,
    entryId: occurrence.entryId,
    occurrenceIndex: occurrence.occurrenceIndex,
    scheduledAt: occurrence.at,
    taken: checked,
  }
  await setDoc(
    doc(db, 'users', uid, 'customDoseLogs', occurrenceLogId(dose.id, occurrence.entryId, occurrence.occurrenceIndex)),
    log,
  )

  await adjustDoseInventory(uid, dose.inventoryBatchId, checked ? -occurrence.doseCount : occurrence.doseCount)
}

/** Dismisses a missed custom occurrence from the active list without claiming it was taken — mirrors `doseLog.ts`'s `clearMissedDose`. Never touches inventory. */
export async function clearMissedCustomOccurrence(
  uid: string,
  doseId: string,
  entryId: string,
  occurrenceIndex: number,
  scheduledAt: number,
): Promise<void> {
  const log: CustomDoseLogDocument = {
    doseId,
    entryId,
    occurrenceIndex,
    scheduledAt,
    taken: false,
    cleared: true,
  }
  await setDoc(doc(db, 'users', uid, 'customDoseLogs', occurrenceLogId(doseId, entryId, occurrenceIndex)), log)
}
