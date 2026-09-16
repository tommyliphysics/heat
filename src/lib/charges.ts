import { addDoc, collection, doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase.ts'

/**
 * Raises an optional charge against some subset of the other group members
 * after logging a shared purchase — `amounts` names only the members
 * actually being charged (skip anyone you're not asking to pay), each with
 * their own amount; there's no even-split default. No running balance is
 * kept anywhere — this is a standalone per-purchase record.
 */
export async function proposeCharge(
  groupId: string,
  batchId: string,
  foodName: string,
  proposerUid: string,
  amounts: Record<string, { amount: string; currency: string }>,
): Promise<void> {
  await addDoc(collection(db, 'groups', groupId, 'charges'), {
    batchId,
    foodName,
    proposerUid,
    createdAt: Date.now(),
    charges: Object.fromEntries(
      Object.entries(amounts).map(([uid, { amount, currency }]) => [
        uid,
        { amount, currency, status: 'pending' },
      ]),
    ),
  })
}

/** A single accept/reject response — writes only the caller's own `charges.{uid}.status`, never contended by another member's response. */
export async function respondToCharge(
  groupId: string,
  chargeId: string,
  uid: string,
  response: 'accepted' | 'rejected',
): Promise<void> {
  await updateDoc(doc(db, 'groups', groupId, 'charges', chargeId), {
    [`charges.${uid}.status`]: response,
  })
}
