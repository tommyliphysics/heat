import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase.ts'
import type { SharedInventoryProposalDocument } from '../types/groups.ts'

/** The single live shared-inventory proposal for one group, if it has one open right now — see `lib/sharedInventoryProposal.ts`. */
export function useSharedInventoryProposal(groupId: string | undefined): {
  proposal: SharedInventoryProposalDocument | null
  loaded: boolean
} {
  const [proposal, setProposal] = useState<SharedInventoryProposalDocument | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!groupId) return
    setLoaded(false)

    return onSnapshot(
      doc(db, 'groups', groupId, 'sharedInventoryProposal', 'current'),
      (snapshot) => {
        setProposal(
          snapshot.exists() ? (snapshot.data() as SharedInventoryProposalDocument) : null,
        )
        setLoaded(true)
      },
      // Expected once this account leaves the group (or it's deleted) while
      // GroupDetailPage is still mounted (see PageRegistry.tsx) — without an
      // error callback, Firestore logs the raw permission-denied itself.
      () => {
        setProposal(null)
        setLoaded(true)
      },
    )
  }, [groupId])

  return { proposal, loaded }
}
