import { useEffect, useRef, useState } from 'react'
import { matchPath, useLocation, useNavigate } from 'react-router-dom'
import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDocs,
  onSnapshot,
  updateDoc,
} from 'firebase/firestore'
import { auth, db } from '../firebase.ts'
import FoodForm from '../components/FoodForm.tsx'
import { useFoodNameIndex } from '../hooks/useFoodNameIndex.ts'
import type { AddFoodNavRequest, AddFoodNavResult } from '../lib/addFoodNav.ts'
import {
  buildFoodDocument,
  dominantCurrency,
  EMPTY_FOOD_FORM_VALUES,
  type FoodFormValues,
} from '../lib/food.ts'
import { currencyFromIP } from '../lib/geoCurrency.ts'
import type { FoodDocument } from '../types/food.ts'

function AddFoodPage() {
  const location = useLocation()
  const navigate = useNavigate()
  // Freezes at its last value while this page isn't the active route,
  // rather than reading location.state live — see PlanMealPage's identical
  // comment/fix: without this, navigating anywhere else would read
  // whatever unrelated state THAT navigation carries, changing FoodForm's
  // `key` below and silently discarding an in-progress "Add Food" draft
  // the moment the user leaves.
  const isActive = !!matchPath('/add-food', location.pathname)
  const lastRequest = useRef<AddFoodNavRequest | null>(null)
  if (isActive) {
    lastRequest.current = location.state as AddFoodNavRequest | null
  }
  const request = lastRequest.current

  // A plain computed value, not `useState`: this page mounts once for the
  // whole session (see PageRegistry.tsx), so a `useState` initializer would
  // capture whatever `request` was at that first-ever mount (always null,
  // since AddFoodPage isn't the active route yet at that point) and never
  // pick up a later `prefillName`. Recomputing every render is safe here —
  // FoodForm only reads `initialValues` at its own mount, which only
  // happens when `key` (derived from the same `request`) actually changes.
  const initialValues: FoodFormValues =
    request?.formKind === 'import'
      ? request.prefillValues
      : { ...EMPTY_FOOD_FORM_VALUES, name: request?.prefillName ?? '' }
  const [defaultCurrency, setDefaultCurrency] = useState<string | undefined>(
    undefined,
  )
  const [existingFoods, setExistingFoods] = useState<
    (FoodDocument & { id: string })[]
  >([])
  const { names: foodNameIndex } = useFoodNameIndex()

  useEffect(() => {
    const user = auth.currentUser
    if (!user) return

    getDocs(collection(db, 'users', user.uid, 'foods')).then(async (snapshot) => {
      const foods = snapshot.docs.map(
        (docSnapshot) => docSnapshot.data() as FoodDocument,
      )
      const currency =
        dominantCurrency(foods) ??
        (await currencyFromIP()) ??
        EMPTY_FOOD_FORM_VALUES.currency
      setDefaultCurrency(currency)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const user = auth.currentUser
    if (!user) return

    return onSnapshot(collection(db, 'users', user.uid, 'foods'), (snapshot) => {
      setExistingFoods(
        snapshot.docs.map(
          (docSnapshot) =>
            ({ id: docSnapshot.id, ...docSnapshot.data() }) as FoodDocument & {
              id: string
            },
        ),
      )
    })
  }, [])

  async function handleSave(values: FoodFormValues, duplicateId: string | null) {
    const user = auth.currentUser
    if (!user) return

    const document = buildFoodDocument(values)

    // A match against an existing food (see FoodForm's duplicate check)
    // updates that food instead of creating a second one with the same
    // name+brand — `deleteField()` is needed here (rather than just
    // omitting the key) because `updateDoc` never removes a field just
    // because the payload doesn't mention it, same as EditFoodPage. Only a
    // genuine new document gets `createdAt`/`addedFrom` stamped — updating
    // an existing one must never overwrite its original provenance.
    let foodId: string
    if (duplicateId) {
      await updateDoc(doc(db, 'users', user.uid, 'foods', duplicateId), {
        ...document,
        brand: document.brand ?? deleteField(),
      })
      foodId = duplicateId
    } else {
      const docRef = await addDoc(collection(db, 'users', user.uid, 'foods'), {
        ...document,
        createdAt: Date.now(),
        ...(request?.formKind === 'import' ? { addedFrom: request.addedFrom } : {}),
      })
      foodId = docRef.id
    }

    // The Connections/Reference "Add to My Foods" flow has no in-progress
    // caller form to hand a result back to — the Foods page just needs to
    // land back where it came from and let its own live listener pick up
    // the new food (see `AddFoodNavRequest`'s `'import'` variant doc comment).
    if (request?.formKind === 'import') {
      navigate(request.returnTo)
      return
    }

    if (request) {
      const newFood = { id: foodId, ...document }
      const result: AddFoodNavResult =
        request.formKind === 'meal'
          ? {
              formKind: 'meal',
              mealValues: request.mealValues,
              forRowId: request.forRowId,
              recipeRowId: request.recipeRowId,
              recipeIngredientRows: request.recipeIngredientRows,
              newFood,
            }
          : request.formKind === 'recipe'
            ? {
                formKind: 'recipe',
                recipeValues: request.recipeValues,
                newFood,
              }
            : {
                formKind: 'mealRecipeOverride',
                mealId: request.mealId,
                entryIndex: request.entryIndex,
                ingredientRows: request.ingredientRows,
                newFood,
              }
      navigate(request.returnTo, { state: result })
    } else {
      navigate('/foods')
    }
  }

  return (
    <FoodForm
      key={request?.navToken ?? 'blank'}
      title="Add Food"
      submitLabel="Add Food"
      savingLabel="Adding..."
      initialValues={initialValues}
      onSubmit={handleSave}
      resetOnSuccess={false}
      foodNameIndex={foodNameIndex}
      defaultCurrency={defaultCurrency}
      existingFoods={existingFoods}
    />
  )
}

export default AddFoodPage
