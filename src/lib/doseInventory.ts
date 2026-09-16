import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase.ts'
import { latestRemaining } from './inventory.ts'
import type { InventoryBatchDocument } from '../types/food.ts'

/**
 * Adjusts a dose's linked inventory stock by `delta` doses — negative when
 * a dose is taken, positive when a check-off is undone. A no-op if the
 * dose has no linked inventory batch (`inventoryBatchId` unset means stock
 * isn't being tracked for it) or if the linked batch has since been
 * deleted. Never lets the count go below 0. These batches always use the
 * whole-item unit (a plain count), so this does plain number arithmetic
 * rather than any unit conversion.
 */
export async function adjustDoseInventory(
  uid: string,
  inventoryBatchId: string | undefined,
  delta: number,
): Promise<void> {
  if (!inventoryBatchId || delta === 0) return

  const batchRef = doc(db, 'users', uid, 'inventory', inventoryBatchId)
  const snapshot = await getDoc(batchRef)
  if (!snapshot.exists()) return
  const batch = snapshot.data() as InventoryBatchDocument

  const next = Math.max(0, Number(latestRemaining(batch)) + delta)

  await updateDoc(batchRef, {
    remainingHistory: [
      ...(batch.remainingHistory ?? []),
      { amount: String(next), timestamp: Date.now() },
    ],
  })
}
