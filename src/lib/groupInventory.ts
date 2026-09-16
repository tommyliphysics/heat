import { collection, collectionGroup, getDocs, query, where } from 'firebase/firestore'
import { db } from '../firebase.ts'
import type { InventoryBatchItem } from '../types/food.ts'

/**
 * Every group `uid` belongs to, sorted by id — the same collection-group
 * query `useGroups` uses (see that hook's doc comment for why it's a plain
 * `uid` field filter rather than a document-id one), but as a one-off fetch
 * rather than a live subscription, for use outside React components (meal
 * consumption reconciliation).
 */
export async function fetchUserGroupIds(uid: string): Promise<string[]> {
  const snapshot = await getDocs(
    query(collectionGroup(db, 'members'), where('uid', '==', uid)),
  )
  return snapshot.docs
    .map((memberDoc) => memberDoc.ref.parent.parent?.id)
    .filter((id): id is string => !!id)
    .sort()
}

export async function fetchGroupBatches(groupId: string): Promise<InventoryBatchItem[]> {
  const snapshot = await getDocs(collection(db, 'groups', groupId, 'inventory'))
  return snapshot.docs.map(
    (batchDoc) => ({ id: batchDoc.id, ...batchDoc.data() }) as InventoryBatchItem,
  )
}
