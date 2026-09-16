import { useEffect } from 'react'
import { collection, doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../firebase.ts'
import { processPendingEdit } from '../lib/pendingEdits.ts'
import { processSharedInventoryProposal } from '../lib/sharedInventoryProposal.ts'
import type { PendingEditListItem, SharedInventoryProposalDocument } from '../types/groups.ts'
import { useGroups } from './useGroups.ts'

/**
 * A pure side-effect hook (nothing rendered, nothing returned) — mounted
 * once in `AuthenticatedShell.tsx` alongside the existing
 * `reconcileInventory` call. Subscribes to every group the signed-in user
 * belongs to and reactively drives two independent unanimous-approval
 * flows for whichever member's client happens to be online to notice them:
 *
 *  - `pendingEdits` — see `lib/pendingEdits.ts`'s `processPendingEdit` for
 *    the two-hop commit-then-apply sequence for a shared food edit.
 *  - `sharedInventoryProposal` — see `lib/sharedInventoryProposal.ts`'s
 *    `processSharedInventoryProposal` for the single-hop flag flip once a
 *    group's shared inventory is fully approved.
 *
 * Deliberately ONE hook with ONE `useGroups()` call and ONE `groupIds`-keyed
 * effect, not two separate hooks each calling `useGroups()` on their own —
 * two independent `useGroups()` consumers mounted at the same time (this
 * one plus a page like NetworkPage.tsx that also needs the list) reliably
 * hung `App.test.tsx`'s slide-transition tests in this codebase's specific
 * persistent-mount setup (every gated page mounts once and stays mounted —
 * see PageRegistry.tsx), even though each hook's own effect body is a no-op
 * with zero groups. Root cause not fully chased down; merging into a single
 * consumer for "watch every group I'm in" made the problem disappear and is
 * also just less redundant, so that's what shipped rather than two thinner
 * hooks each paying for their own collection-group listener.
 */
export function useGroupWatchers(): void {
  const { groups } = useGroups()
  const groupIds = groups.map((g) => g.id).join(',')

  useEffect(() => {
    const user = auth.currentUser
    if (!user || !groupIds) return

    // A no-op error handler, not omitted: right after this account leaves a
    // group, `groupIds` (from `useGroups()`) hasn't dropped it yet for one
    // more tick, so these listeners can still be subscribed to it for a
    // moment after the member doc is already gone — Firestore logs that
    // permission-denied to the console itself if there's no error callback.
    const ids = groupIds.split(',')
    const unsubscribes = ids.flatMap((groupId) => [
      onSnapshot(
        collection(db, 'groups', groupId, 'pendingEdits'),
        (snapshot) => {
          for (const editDoc of snapshot.docs) {
            const edit = { id: editDoc.id, ...editDoc.data() } as PendingEditListItem
            if (edit.status !== 'pending' && edit.status !== 'canonicalApplied') continue
            processPendingEdit(groupId, edit, user.uid).catch((err) => {
              console.error('Failed to process pending edit', err)
            })
          }
        },
        () => {},
      ),
      onSnapshot(
        doc(db, 'groups', groupId, 'sharedInventoryProposal', 'current'),
        (snapshot) => {
          if (!snapshot.exists()) return
          const proposal = snapshot.data() as SharedInventoryProposalDocument
          processSharedInventoryProposal(groupId, proposal).catch((err) => {
            console.error('Failed to process shared inventory proposal', err)
          })
        },
        () => {},
      ),
    ])

    return () => unsubscribes.forEach((unsubscribe) => unsubscribe())
  }, [groupIds])
}
