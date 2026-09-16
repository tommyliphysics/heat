import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { auth, db } from '../firebase.ts'
import { useDoses } from './useDoses.ts'
import {
  computeMissedDoses,
  MISSED_DOSE_FALLBACK_LOOKBACK_DAYS,
  type MissedDose,
} from '../lib/missedDoses.ts'
import { addDays, toDateStr } from '../lib/timeline.ts'
import type { DoseLogDocument } from '../types/doses.ts'

export function useMissedDoses(): MissedDose[] {
  const { doses, loaded: dosesLoaded } = useDoses()
  const [logsByKey, setLogsByKey] = useState<Map<string, DoseLogDocument>>(
    new Map(),
  )
  const [logsLoaded, setLogsLoaded] = useState(false)

  const todayStr = toDateStr(new Date())

  // The earliest date any dose might need checking from — a single range
  // query covers every dose's own history at once.
  const earliestStart = doses.reduce<string | null>((earliest, dose) => {
    const start = dose.createdAt
      ? toDateStr(new Date(dose.createdAt))
      : addDays(todayStr, -MISSED_DOSE_FALLBACK_LOOKBACK_DAYS)
    return !earliest || start < earliest ? start : earliest
  }, null)

  useEffect(() => {
    const user = auth.currentUser
    if (!user || !earliestStart) return

    return onSnapshot(
      query(
        collection(db, 'users', user.uid, 'doseLogs'),
        where('date', '>=', earliestStart),
      ),
      (snapshot) => {
        const map = new Map<string, DoseLogDocument>()
        for (const docSnapshot of snapshot.docs) {
          const data = docSnapshot.data() as DoseLogDocument
          map.set(`${data.doseId}_${data.date}`, data)
        }
        setLogsByKey(map)
        setLogsLoaded(true)
      },
    )
  }, [earliestStart])

  // Before the doseLogs snapshot arrives, `logsByKey` is empty — which looks
  // identical to "nothing was ever taken." Returning real results this
  // early would flash every past day as missed even when it wasn't,
  // correcting itself only once the real log data streams in. `earliestStart`
  // is null only when there are no doses to check in the first place, so
  // there's nothing to wait for in that case.
  if (!dosesLoaded || (earliestStart && !logsLoaded)) return []

  return computeMissedDoses(doses, logsByKey, todayStr)
}
