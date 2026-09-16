import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../firebase.ts'
import type { InventoryBatchItem } from '../types/food.ts'

export function useInventoryBatches(): {
  batches: InventoryBatchItem[]
  loaded: boolean
} {
  const [batches, setBatches] = useState<InventoryBatchItem[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const user = auth.currentUser
    if (!user) return

    return onSnapshot(
      collection(db, 'users', user.uid, 'inventory'),
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
    )
  }, [])

  return { batches, loaded }
}
