import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase.ts'
import type { PendingEditListItem } from '../types/groups.ts'

export function useGroupPendingEdits(groupId: string | undefined): {
  pendingEdits: PendingEditListItem[]
  loaded: boolean
} {
  const [pendingEdits, setPendingEdits] = useState<PendingEditListItem[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!groupId) return
    setLoaded(false)

    return onSnapshot(
      collection(db, 'groups', groupId, 'pendingEdits'),
      (snapshot) => {
        setPendingEdits(
          snapshot.docs.map(
            (editDoc) => ({ id: editDoc.id, ...editDoc.data() }) as PendingEditListItem,
          ),
        )
        setLoaded(true)
      },
      // Expected once this account leaves the group (or it's deleted) while
      // GroupDetailPage is still mounted (see PageRegistry.tsx) — without an
      // error callback, Firestore logs the raw permission-denied itself.
      () => {
        setPendingEdits([])
        setLoaded(true)
      },
    )
  }, [groupId])

  return { pendingEdits, loaded }
}
