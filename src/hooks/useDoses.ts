import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../firebase.ts'
import type { DoseListItem } from '../types/doses.ts'

export function useDoses(): { doses: DoseListItem[]; loaded: boolean } {
  const [doses, setDoses] = useState<DoseListItem[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const user = auth.currentUser
    if (!user) return

    return onSnapshot(
      collection(db, 'users', user.uid, 'doses'),
      (snapshot) => {
        setDoses(
          snapshot.docs
            .map(
              (docSnapshot) =>
                ({ id: docSnapshot.id, ...docSnapshot.data() }) as DoseListItem,
            )
            .sort((a, b) => a.name.localeCompare(b.name)),
        )
        setLoaded(true)
      },
    )
  }, [])

  return { doses, loaded }
}
