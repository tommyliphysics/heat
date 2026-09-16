import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase.ts'
import type { InventoryBatchItem } from '../types/food.ts'

/** Live batches for one group's shared inventory — same shape as `useInventoryBatches`, just scoped to `groups/{groupId}/inventory` instead of a personal collection. */
export function useGroupInventoryBatches(groupId: string): {
  batches: InventoryBatchItem[]
  loaded: boolean
} {
  const [batches, setBatches] = useState<InventoryBatchItem[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setLoaded(false)

    return onSnapshot(
      collection(db, 'groups', groupId, 'inventory'),
      (snapshot) => {
        setBatches(
          snapshot.docs.map(
            (docSnapshot) =>
              ({
                id: docSnapshot.id,
                ...docSnapshot.data(),
              }) as InventoryBatchItem,
          ),
        )
        setLoaded(true)
      },
      // Expected once this account leaves the group (or it's deleted) while
      // this listener is still mounted — without an error callback,
      // Firestore logs the raw permission-denied itself.
      () => {
        setBatches([])
        setLoaded(true)
      },
    )
  }, [groupId])

  return { batches, loaded }
}
