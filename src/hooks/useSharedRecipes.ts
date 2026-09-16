import { useEffect, useState } from 'react'
import { collectionGroup, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase.ts'
import type { RecipeDocument } from '../types/food.ts'

export type SharedRecipeItem = RecipeDocument & { id: string; ownerUid: string }

/** Every recipe shared with any of the caller's groups — see `useSharedFoods` for the identical reasoning (same rule shape, same index requirement, just on `recipes` instead of `foods`). */
export function useSharedRecipes(groupIds: string[]): {
  recipes: SharedRecipeItem[]
  loaded: boolean
} {
  const [recipes, setRecipes] = useState<SharedRecipeItem[]>([])
  const [loaded, setLoaded] = useState(false)

  const groupIdsKey = groupIds.slice().sort().join(',')

  useEffect(() => {
    const ids = groupIdsKey ? groupIdsKey.split(',') : []
    if (ids.length === 0) {
      setRecipes([])
      setLoaded(true)
      return
    }

    setLoaded(false)
    return onSnapshot(
      query(collectionGroup(db, 'recipes'), where('sharedWith', 'in', ids)),
      (snapshot) => {
        setRecipes(
          snapshot.docs.map(
            (docSnapshot) =>
              ({
                id: docSnapshot.id,
                ownerUid: docSnapshot.ref.parent.parent!.id,
                ...docSnapshot.data(),
              }) as SharedRecipeItem,
          ),
        )
        setLoaded(true)
      },
    )
  }, [groupIdsKey])

  return { recipes, loaded }
}
