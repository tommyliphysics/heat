import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase.ts'
import { normalizedFoodKey } from './food.ts'
import type { FoodDocument } from '../types/food.ts'
import type { SharedItemDocument, SharedItemFields } from '../types/groups.ts'

/** Pulls out exactly the fields a `SharedItemDocument`/pending-edit tracks — everything about a food that matters for group-inventory identity and cost math, minus the matching key (`name`/`brand`, locked once established) and `servingSize` (cosmetic only). */
export function sharedItemFieldsOf(food: FoodDocument): SharedItemFields {
  return {
    quantity: food.quantity,
    energy: food.energy,
    macronutrients: food.macronutrients,
    micronutrients: food.micronutrients,
    price: { amount: food.price.amount, currency: food.price.currency },
  }
}

/** Deep-equal on exactly the tracked fields — used to decide whether an add proceeds untouched, or a save actually changes anything worth proposing. */
export function sharedItemFieldsEqual(a: SharedItemFields, b: SharedItemFields): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export type SharedItemDiffRow = { label: string; mine: string; theirs: string }

/** A human-readable list of exactly which tracked fields differ between the caller's own values and the group's canonical ones — for the mismatch modal. Empty when `sharedItemFieldsEqual` would be true. */
export function describeSharedItemDiff(
  mine: SharedItemFields,
  theirs: SharedItemFields,
): SharedItemDiffRow[] {
  const rows: SharedItemDiffRow[] = []

  if (JSON.stringify(mine.quantity) !== JSON.stringify(theirs.quantity)) {
    rows.push({
      label: 'Quantity',
      mine: `${mine.quantity.amount}${mine.quantity.unit}`,
      theirs: `${theirs.quantity.amount}${theirs.quantity.unit}`,
    })
  }
  if (JSON.stringify(mine.energy) !== JSON.stringify(theirs.energy)) {
    rows.push({
      label: 'Energy',
      mine: `${mine.energy.amount} ${mine.energy.unit}`,
      theirs: `${theirs.energy.amount} ${theirs.energy.unit}`,
    })
  }
  for (const key of ['carbs', 'fat', 'protein'] as const) {
    if (mine.macronutrients[key].amount !== theirs.macronutrients[key].amount) {
      rows.push({
        label: key === 'carbs' ? 'Carbs' : key === 'fat' ? 'Fat' : 'Protein',
        mine: `${mine.macronutrients[key].amount}g`,
        theirs: `${theirs.macronutrients[key].amount}g`,
      })
    }
  }
  const microNames = new Set([
    ...Object.keys(mine.micronutrients),
    ...Object.keys(theirs.micronutrients),
  ])
  for (const name of microNames) {
    const mineMicro = mine.micronutrients[name]
    const theirsMicro = theirs.micronutrients[name]
    if (JSON.stringify(mineMicro) !== JSON.stringify(theirsMicro)) {
      rows.push({
        label: name,
        mine: mineMicro ? `${mineMicro.amount}${mineMicro.unit}` : '—',
        theirs: theirsMicro ? `${theirsMicro.amount}${theirsMicro.unit}` : '—',
      })
    }
  }
  if (
    mine.price.amount !== theirs.price.amount ||
    mine.price.currency !== theirs.price.currency
  ) {
    rows.push({
      label: 'Price',
      mine: `${mine.price.currency} ${mine.price.amount}`,
      theirs: `${theirs.price.currency} ${theirs.price.amount}`,
    })
  }

  return rows
}

export async function fetchSharedItem(
  groupId: string,
  key: string,
): Promise<SharedItemDocument | null> {
  const snapshot = await getDoc(doc(db, 'groups', groupId, 'sharedItems', key))
  if (!snapshot.exists()) return null
  return snapshot.data() as SharedItemDocument
}

/** Establishes the group's canonical version of a food the first time it's added to that group's inventory — seeded from whoever added it first. */
export async function establishSharedItem(
  groupId: string,
  food: FoodDocument,
  establishedBy: string,
): Promise<void> {
  const key = normalizedFoodKey(food.name, food.brand)
  await setDoc(doc(db, 'groups', groupId, 'sharedItems', key), {
    name: food.name,
    ...(food.brand ? { brand: food.brand } : {}),
    ...sharedItemFieldsOf(food),
    establishedBy,
    establishedAt: Date.now(),
  })
}

/** Overwrites the caller's own food record's tracked fields with the group's canonical values — the "sync" action offered when a mismatch is found on add. Never touches name/brand (already identical, since that's the matching key) or servingSize (not tracked). Reads the food first and merges into its existing `price` object rather than replacing it outright, so untracked price fields (`retailer`, `quantity`) survive the sync. */
export async function syncFoodToSharedItem(
  uid: string,
  foodId: string,
  sharedItem: SharedItemDocument,
): Promise<void> {
  const ref = doc(db, 'users', uid, 'foods', foodId)
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) return
  const food = snapshot.data() as FoodDocument

  await updateDoc(ref, {
    quantity: sharedItem.quantity,
    energy: sharedItem.energy,
    macronutrients: sharedItem.macronutrients,
    micronutrients: sharedItem.micronutrients,
    price: {
      ...food.price,
      amount: sharedItem.price.amount,
      currency: sharedItem.price.currency,
    },
  })
}
