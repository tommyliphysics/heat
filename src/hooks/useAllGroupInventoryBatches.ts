import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase.ts'
import type { InventoryBatchItem } from '../types/food.ts'
import { useGroups } from './useGroups.ts'

/**
 * Every batch across every group the signed-in user belongs to, flattened
 * into one array — for callers (Calendar/Shopping List pages) that just
 * need a pooled batch list to hand to `applyInventoryPricing`, and don't
 * care which group a given batch came from. Subscribes to each group's
 * `inventory` collection directly inside one effect (rather than calling
 * `useGroupInventoryBatches` once per group), since the number of groups
 * is dynamic and hooks can't be called a variable number of times.
 */
export function useAllGroupInventoryBatches(): {
  batches: InventoryBatchItem[]
  loaded: boolean
} {
  const { groups, loaded: groupsLoaded } = useGroups()
  const [batchesByGroup, setBatchesByGroup] = useState<
    Record<string, InventoryBatchItem[]>
  >({})

  const groupIds = groups.map((g) => g.id).join(',')

  useEffect(() => {
    if (!groupIds) {
      setBatchesByGroup({})
      return
    }

    // A no-op error handler, not omitted: right after this account leaves a
    // group, `groupIds` hasn't dropped it yet for one more tick, so this can
    // still be subscribed to it for a moment after the member doc is
    // already gone — Firestore logs that permission-denied to the console
    // itself if there's no error callback.
    const ids = groupIds.split(',')
    const unsubscribes = ids.map((groupId) =>
      onSnapshot(
        collection(db, 'groups', groupId, 'inventory'),
        (snapshot) => {
          setBatchesByGroup((current) => ({
            ...current,
            [groupId]: snapshot.docs.map(
              (batchDoc) =>
                ({ id: batchDoc.id, ...batchDoc.data() }) as InventoryBatchItem,
            ),
          }))
        },
        () => {
          setBatchesByGroup((current) => {
            const { [groupId]: _removed, ...rest } = current
            return rest
          })
        },
      ),
    )

    return () => unsubscribes.forEach((unsubscribe) => unsubscribe())
  }, [groupIds])

  const batches = useMemo(
    () => Object.values(batchesByGroup).flat(),
    [batchesByGroup],
  )

  return { batches, loaded: groupsLoaded }
}
