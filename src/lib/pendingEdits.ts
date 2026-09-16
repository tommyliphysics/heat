import { addDoc, collection, doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase.ts'
import { fetchGroupMemberUids } from './groups.ts'
import type { FoodDocument } from '../types/food.ts'
import type { PendingEditListItem, SharedItemDocument, SharedItemFields } from '../types/groups.ts'

function sharedFieldsOfDocument(document: Partial<FoodDocument>): SharedItemFields {
  return {
    quantity: document.quantity!,
    energy: document.energy!,
    macronutrients: document.macronutrients!,
    micronutrients: document.micronutrients!,
    price: { amount: document.price!.amount, currency: document.price!.currency },
  }
}

/**
 * Proposes a change to a food that backs an established shared item.
 * `proposedDocument` is the food's whole new field set (see
 * `PendingEditDocument`'s doc comment for why name/brand must already be
 * excluded by the caller) — `requiredApprovers` is fetched fresh here as a
 * one-time snapshot, not tied to any live subscription, so it's frozen at
 * exactly this moment regardless of later membership changes.
 */
export async function proposeEdit(
  groupId: string,
  foodOwnerUid: string,
  foodId: string,
  itemKey: string,
  itemName: string,
  proposedDocument: Partial<FoodDocument>,
  currentSharedItem: SharedItemDocument,
): Promise<void> {
  const memberUids = await fetchGroupMemberUids(groupId)
  const requiredApprovers = memberUids.filter((uid) => uid !== foodOwnerUid)

  await addDoc(collection(db, 'groups', groupId, 'pendingEdits'), {
    foodOwnerUid,
    foodId,
    itemKey,
    itemName,
    proposedDocument,
    proposedFields: sharedFieldsOfDocument(proposedDocument),
    previousFields: {
      quantity: currentSharedItem.quantity,
      energy: currentSharedItem.energy,
      macronutrients: currentSharedItem.macronutrients,
      micronutrients: currentSharedItem.micronutrients,
      price: currentSharedItem.price,
    },
    requiredApprovers,
    approvals: {},
    status: 'pending',
    createdAt: Date.now(),
  })
}

/** A single approve/reject vote — writes only the caller's own `approvals.{uid}` entry, never contended by another member's vote. */
export async function respondToPendingEdit(
  groupId: string,
  editId: string,
  uid: string,
  response: 'approved' | 'rejected',
): Promise<void> {
  await updateDoc(doc(db, 'groups', groupId, 'pendingEdits', editId), {
    [`approvals.${uid}`]: response,
  })
}

function isFullyApproved(edit: PendingEditListItem): boolean {
  return edit.requiredApprovers.every((uid) => edit.approvals[uid] === 'approved')
}

function isRejected(edit: PendingEditListItem): boolean {
  return edit.requiredApprovers.some((uid) => edit.approvals[uid] === 'rejected')
}

/**
 * Runs once per live snapshot of a group's pendingEdits, for every member's
 * client (not just the proposer's) — see `hooks/useGroupWatchers.ts`.
 * Two independent things can happen here:
 *  - any member notices full approval and commits the agreed fields to
 *    `sharedItems` (a plain `updateDoc`, not a transaction — every
 *    approving client would write the exact same target value, so a race
 *    between them is harmless, unlike the delta-based writes in
 *    `lib/inventoryReconcile.ts`);
 *  - the proposer's own client notices that commit and applies the full
 *    proposed document to its own food record — the only write nobody
 *    else could make, since only the owning account can write its own
 *    food doc. This half can only ever happen once the proposer's own
 *    client is online to see it, which may be well after the last
 *    approval landed — an accepted, documented trade-off.
 */
export async function processPendingEdit(
  groupId: string,
  edit: PendingEditListItem,
  myUid: string,
): Promise<void> {
  if (edit.status === 'pending' && isFullyApproved(edit)) {
    await updateDoc(doc(db, 'groups', groupId, 'sharedItems', edit.itemKey), edit.proposedFields)
    await updateDoc(doc(db, 'groups', groupId, 'pendingEdits', edit.id), {
      status: 'canonicalApplied',
    })
    return
  }

  if (edit.status === 'canonicalApplied' && edit.foodOwnerUid === myUid) {
    await updateDoc(doc(db, 'users', myUid, 'foods', edit.foodId), edit.proposedDocument)
    await updateDoc(doc(db, 'groups', groupId, 'pendingEdits', edit.id), { status: 'done' })
  }
}

export { isFullyApproved, isRejected }
