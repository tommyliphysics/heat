import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { auth, db } from '../firebase.ts'
import { generateDoseOccurrences, occurrenceLogId } from '../lib/customSchedule.ts'
import type { CustomDoseLogDocument, DoseListItem } from '../types/doses.ts'

export type CustomDoseLogsResult = {
  logsById: Map<string, CustomDoseLogDocument>
  /** False until the `customDoseLogs` snapshot has loaded at least once for the current `customDoses` — an empty `logsById` before then looks identical to "nothing was ever taken," so callers should treat "not loaded" as "no answer yet" rather than computing real statuses/missed lists against it. */
  loaded: boolean
}

/**
 * Maps `customDoseLogs` doc id -> its record, for every custom-schedule
 * dose's occurrences whose scheduled time is on or after the earliest
 * occurrence across those doses. Bounded by the actual generated
 * occurrences rather than `dose.createdAt` — unlike a recurring dose (whose
 * occurrences only ever start from creation onward), a custom schedule
 * entry's date is chosen freely by the user and can predate `createdAt`
 * (e.g. backfilling, or editing an entry to an earlier date).
 */
export function useCustomDoseLogs(customDoses: DoseListItem[]): CustomDoseLogsResult {
  const [logsById, setLogsById] = useState<Map<string, CustomDoseLogDocument>>(new Map())
  const [loaded, setLoaded] = useState(false)

  const earliestOccurrenceAt = customDoses.reduce<number | null>((earliest, dose) => {
    const occurrences = generateDoseOccurrences(dose)
    if (occurrences.length === 0) return earliest
    const doseEarliest = occurrences[0].at
    return earliest === null || doseEarliest < earliest ? doseEarliest : earliest
  }, null)

  useEffect(() => {
    const user = auth.currentUser
    if (!user || customDoses.length === 0) {
      setLogsById(new Map())
      setLoaded(true)
      return
    }

    setLoaded(false)
    return onSnapshot(
      query(
        collection(db, 'users', user.uid, 'customDoseLogs'),
        where('scheduledAt', '>=', earliestOccurrenceAt ?? 0),
      ),
      (snapshot) => {
        const map = new Map<string, CustomDoseLogDocument>()
        for (const docSnapshot of snapshot.docs) {
          const data = docSnapshot.data() as CustomDoseLogDocument
          map.set(occurrenceLogId(data.doseId, data.entryId, data.occurrenceIndex), data)
        }
        setLogsById(map)
        setLoaded(true)
      },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customDoses.length, earliestOccurrenceAt])

  return { logsById, loaded }
}
