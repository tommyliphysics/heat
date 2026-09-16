import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { auth, db } from '../firebase.ts'
import { toDateStr } from '../lib/timeline.ts'
import type { DoseLogDocument } from '../types/doses.ts'

/** Maps doseId -> today's taken/not-taken array, for every dose with a log entry today. */
export function useTodayDoseLogs(): Record<string, boolean[]> {
  const todayStr = toDateStr(new Date())
  const [logs, setLogs] = useState<Record<string, boolean[]>>({})

  useEffect(() => {
    const user = auth.currentUser
    if (!user) return

    return onSnapshot(
      query(
        collection(db, 'users', user.uid, 'doseLogs'),
        where('date', '==', todayStr),
      ),
      (snapshot) => {
        const next: Record<string, boolean[]> = {}
        for (const docSnapshot of snapshot.docs) {
          const data = docSnapshot.data() as DoseLogDocument
          next[data.doseId] = data.taken
        }
        setLogs(next)
      },
    )
  }, [todayStr])

  return logs
}
