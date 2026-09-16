import { useEffect, useState } from 'react'
import { collectionGroup, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase.ts'
import type { FoodDocument } from '../types/food.ts'

export type SharedFoodItem = FoodDocument & { id: string; ownerUid: string }

/**
 * Every food shared with any of the caller's groups (`groupIds` — pass
 * `useGroups()`'s full list, hidden `autoPair` groups included, since a food
 * shared via a pair-group should still show up here). A collection-group
 * query filtered by `resource.data.sharedWith` — already permitted by the
 * existing `foods` sharing rule in firestore.rules (it keys off
 * `resource.data.sharedWith`, not a path wildcard, so this works for a
 * `list` query the same way the `members`/`uid` one does), but needs its own
 * manually-added single-field index (collection group scope) the same way
 * that one did.
 */
export function useSharedFoods(groupIds: string[]): {
  foods: SharedFoodItem[]
  loaded: boolean
} {
  const [foods, setFoods] = useState<SharedFoodItem[]>([])
  const [loaded, setLoaded] = useState(false)

  // A plain sorted string, not the array itself, as the dependency — same
  // reasoning as `useGroups`'s `groupIdsKey`: avoids resubscribing on every
  // render that hands back a new-but-equivalent array.
  const groupIdsKey = groupIds.slice().sort().join(',')

  useEffect(() => {
    const ids = groupIdsKey ? groupIdsKey.split(',') : []
    if (ids.length === 0) {
      setFoods([])
      setLoaded(true)
      return
    }

    setLoaded(false)
    // Firestore's `in` supports up to 30 values — comfortably more than any
    // real account's group count.
    return onSnapshot(
      query(collectionGroup(db, 'foods'), where('sharedWith', 'in', ids)),
      (snapshot) => {
        setFoods(
          snapshot.docs.map(
            (docSnapshot) =>
              ({
                id: docSnapshot.id,
                ownerUid: docSnapshot.ref.parent.parent!.id,
                ...docSnapshot.data(),
              }) as SharedFoodItem,
          ),
        )
        setLoaded(true)
      },
    )
  }, [groupIdsKey])

  return { foods, loaded }
}
