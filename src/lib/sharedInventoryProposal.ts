import { deleteDoc, doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase.ts'
import { fetchGroupMemberUids } from './groups.ts'
import type { SharedInventoryProposalDocument } from '../types/groups.ts'

const PROPOSAL_DOC_ID = 'current'

function proposalRef(groupId: string) {
  return doc(db, 'groups', groupId, 'sharedInventoryProposal', PROPOSAL_DOC_ID)
}

/** Proposes turning on this group's shared inventory — `requiredApprovers` is every OTHER member, snapshotted at propose time (same reasoning as `lib/pendingEdits.ts`'s `proposeEdit`: someone joining or leaving mid-review shouldn't move the unanimity bar). `setDoc`, not `updateDoc`: `processSharedInventoryProposal` always deletes this doc between proposals (on rejection or full approval), so there's never an existing doc to merge into — re-proposing after a rejection is just as much a fresh write as the very first proposal. */
export async function proposeSharedInventory(
  groupId: string,
  proposerUid: string,
): Promise<void> {
  const memberUids = await fetchGroupMemberUids(groupId)
  const requiredApprovers = memberUids.filter((uid) => uid !== proposerUid)

  await setDoc(proposalRef(groupId), {
    proposedBy: proposerUid,
    requiredApprovers,
    approvals: {},
    createdAt: Date.now(),
  })
}

/** A single approve/reject vote — writes only the caller's own `approvals.{uid}` entry, never contended by another member's vote. */
export async function respondToSharedInventoryProposal(
  groupId: string,
  uid: string,
  response: 'approved' | 'rejected',
): Promise<void> {
  await updateDoc(proposalRef(groupId), { [`approvals.${uid}`]: response })
}

function isFullyApproved(proposal: SharedInventoryProposalDocument): boolean {
  return proposal.requiredApprovers.every((uid) => proposal.approvals[uid] === 'approved')
}

function isRejected(proposal: SharedInventoryProposalDocument): boolean {
  return proposal.requiredApprovers.some((uid) => proposal.approvals[uid] === 'rejected')
}

/**
 * Runs once per live snapshot of a group's proposal, for every member's
 * client — see `hooks/useGroupWatchers.ts`. Single-hop,
 * unlike `lib/pendingEdits.ts`'s food-edit flow: a group-level flag has no
 * single owning account the way a food doc does, so once fully approved any
 * member can just flip `sharedInventoryEnabled` directly — the group doc's
 * own `update` rule already permits any member to write it.
 */
export async function processSharedInventoryProposal(
  groupId: string,
  proposal: SharedInventoryProposalDocument,
): Promise<void> {
  if (isFullyApproved(proposal)) {
    const batch = writeBatch(db)
    batch.update(doc(db, 'groups', groupId), { sharedInventoryEnabled: true })
    batch.delete(proposalRef(groupId))
    await batch.commit()
    return
  }

  if (isRejected(proposal)) {
    await deleteDoc(proposalRef(groupId))
  }
}

export { isFullyApproved, isRejected }
