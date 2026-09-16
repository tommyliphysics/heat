import { useEffect, useState } from 'react'

export type FoodNameEntry = { name: string; source: string }

// Module-level cache: this file rarely changes, so fetch it once per page
// load and reuse it across every AddFoodPage/EditFoodPage visit. `fetchPromise`
// also de-dupes concurrent mounts into a single in-flight request.
let cachedNames: FoodNameEntry[] | null = null
let fetchPromise: Promise<FoodNameEntry[]> | null = null

function fetchFoodNames(): Promise<FoodNameEntry[]> {
  if (cachedNames) return Promise.resolve(cachedNames)

  if (!fetchPromise) {
    fetchPromise = fetch(`${import.meta.env.BASE_URL}foodNames.json`)
      .then((res) => res.json() as Promise<FoodNameEntry[]>)
      .then((entries) => {
        cachedNames = entries
        return entries
      })
      .catch((error) => {
        fetchPromise = null
        console.error('[useFoodNameIndex] failed to fetch food names', error)
        throw error
      })
  }

  return fetchPromise
}

/**
 * Loads the local food-name index (name + source dataset, for every
 * AUSNUT/AFCD/USDA reference food) once per page load, cached across mounts.
 * This powers the "load nutrition from a reference food" autocomplete
 * without querying Firestore just to search names — the full nutrition data
 * for a specific food is only fetched once the user picks one, via
 * `fetchPublicFoodByName` in `lib/publicFoodLookup.ts`.
 */
export function useFoodNameIndex() {
  const [names, setNames] = useState<FoodNameEntry[]>(cachedNames ?? [])
  const [loaded, setLoaded] = useState(cachedNames !== null)

  useEffect(() => {
    if (cachedNames) return
    fetchFoodNames()
      .then((result) => {
        setNames(result)
        setLoaded(true)
      })
      .catch(() => {})
  }, [])

  return { names, loaded }
}
