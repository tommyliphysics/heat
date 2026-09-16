import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../firebase.ts'
import type { ConnectionRequestListItem } from '../types/connections.ts'

/** Every still-open request against this account's permanent connect code. */
export function useConnectionRequests(): {
  requests: ConnectionRequestListItem[]
  loaded: boolean
} {
  const [requests, setRequests] = useState<ConnectionRequestListItem[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const user = auth.currentUser
    if (!user) return

    return onSnapshot(
      collection(db, 'users', user.uid, 'connectionRequests'),
      (snapshot) => {
        setRequests(
          snapshot.docs.map(
            (docSnapshot) =>
              ({
                requesterUid: docSnapshot.id,
                ...docSnapshot.data(),
              }) as ConnectionRequestListItem,
          ),
        )
        setLoaded(true)
      },
    )
  }, [])

  return { requests, loaded }
}
