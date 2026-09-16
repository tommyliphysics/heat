import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase.ts'
import type { ChargeListItem } from '../types/groups.ts'

export function useGroupCharges(groupId: string | undefined): {
  charges: ChargeListItem[]
  loaded: boolean
} {
  const [charges, setCharges] = useState<ChargeListItem[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!groupId) return
    setLoaded(false)

    return onSnapshot(
      collection(db, 'groups', groupId, 'charges'),
      (snapshot) => {
        setCharges(
          snapshot.docs.map(
            (chargeDoc) => ({ id: chargeDoc.id, ...chargeDoc.data() }) as ChargeListItem,
          ),
        )
        setLoaded(true)
      },
      // Expected once this account leaves the group (or it's deleted) while
      // GroupDetailPage is still mounted (see PageRegistry.tsx) — without an
      // error callback, Firestore logs the raw permission-denied itself.
      () => {
        setCharges([])
        setLoaded(true)
      },
    )
  }, [groupId])

  return { charges, loaded }
}
