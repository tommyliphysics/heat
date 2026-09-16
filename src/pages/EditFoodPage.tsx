import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  updateDoc,
} from 'firebase/firestore'
import { auth, db } from '../firebase.ts'
import FoodForm from '../components/FoodForm.tsx'
import LoadingIndicator from '../components/LoadingIndicator.tsx'
import PageLayout from '../components/PageLayout.tsx'
import { useFoodNameIndex } from '../hooks/useFoodNameIndex.ts'
import { useRouteParam } from '../hooks/useRouteParam.ts'
import { useUserSettings } from '../hooks/useUserSettings.ts'
import {
  buildFoodDocument,
  describeAddedFrom,
  foodDocumentToFormValues,
  normalizedFoodKey,
  type FoodFormValues,
} from '../lib/food.ts'
import { proposeEdit } from '../lib/pendingEdits.ts'
import {
  fetchSharedItem,
  sharedItemFieldsEqual,
  sharedItemFieldsOf,
} from '../lib/sharedItems.ts'
import type { FoodDocument } from '../types/food.ts'
import type { GroupDocument, SharedItemDocument } from '../types/groups.ts'
import './pages.css'

type Gating = {
  groupId: string
  groupName: string
  itemKey: string
  sharedItem: SharedItemDocument
}

function EditFoodPage() {
  const foodId = useRouteParam('/foods/:foodId/edit', 'foodId')
  const navigate = useNavigate()
  const [values, setValues] = useState<FoodFormValues | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [existingFoods, setExistingFoods] = useState<
    (FoodDocument & { id: string })[]
  >([])
  const [gating, setGating] = useState<Gating | null>(null)
  const [pendingSubmitted, setPendingSubmitted] = useState(false)
  const [provenance, setProvenance] = useState<
    Pick<FoodDocument, 'createdAt' | 'addedFrom'> | null
  >(null)
  const { names: foodNameIndex } = useFoodNameIndex()
  const { dateFormat } = useUserSettings()

  useEffect(() => {
    const user = auth.currentUser
    if (!user || !foodId) return

    // Clears any previous food's values immediately, before this fetch
    // resolves — otherwise, switching directly from one food's edit page to
    // another's, `values` would stay truthy (the old food's) through the
    // async gap, and `<FoodForm key={foodId}>` below would mount its fresh
    // instance (the key already changed) seeded with that stale data; by
    // the time the real fetch resolves the key isn't changing again, so a
    // form that doesn't resync props into state (see FoodForm.tsx) would
    // never pick up the correction. Resetting to `null` re-arms the
    // `!values` loading guard so the fresh mount only happens once the
    // right data has actually arrived.
    setValues(null)
    setGating(null)
    setPendingSubmitted(false)
    setProvenance(null)

    getDoc(doc(db, 'users', user.uid, 'foods', foodId)).then(async (snapshot) => {
      if (!snapshot.exists()) {
        setNotFound(true)
        return
      }
      const food = snapshot.data() as FoodDocument
      setValues(foodDocumentToFormValues(food))
      setProvenance({ createdAt: food.createdAt, addedFrom: food.addedFrom })

      // Gating is frozen against this food's *current* name/brand, not
      // whatever the user might type into the (disabled, once gated) name
      // and brand fields — there's nothing to recompute as they edit.
      if (!food.sharedWith) return
      const itemKey = normalizedFoodKey(food.name, food.brand)
      const sharedItem = await fetchSharedItem(food.sharedWith, itemKey)
      if (!sharedItem) return

      const groupSnapshot = await getDoc(doc(db, 'groups', food.sharedWith))
      const groupName = groupSnapshot.exists()
        ? (groupSnapshot.data() as GroupDocument).name
        : 'the group'
      setGating({ groupId: food.sharedWith, groupName, itemKey, sharedItem })
    })
  }, [foodId])

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

  async function handleSave(formValues: FoodFormValues, duplicateId: string | null) {
    const user = auth.currentUser
    if (!user || !foodId) return

    const document = buildFoodDocument(formValues)

    // Gated: name/brand are disabled in the form, so `document` never
    // differs from `gating`'s food on those — only nutrition/price can
    // have changed. If they have, this save proposes rather than applies;
    // if not (e.g. only `servingSize` changed, which isn't tracked), it
    // falls through to the normal direct save below.
    if (gating) {
      const canonicalFields = {
        quantity: gating.sharedItem.quantity,
        energy: gating.sharedItem.energy,
        macronutrients: gating.sharedItem.macronutrients,
        micronutrients: gating.sharedItem.micronutrients,
        price: gating.sharedItem.price,
      }
      if (!sharedItemFieldsEqual(sharedItemFieldsOf(document), canonicalFields)) {
        const { name: _name, brand: _brand, ...proposedDocument } = document
        await proposeEdit(
          gating.groupId,
          user.uid,
          foodId,
          gating.itemKey,
          gating.sharedItem.name,
          proposedDocument,
          gating.sharedItem,
        )
        setPendingSubmitted(true)
        return
      }
    }

    // A match against a DIFFERENT existing food (see FoodForm's duplicate
    // check — this food's own id is always excluded) means saving here
    // would create a second food with the same name+brand. Instead, the
    // edit is redirected onto that existing food, and this food's own
    // document is left untouched rather than also being renamed to match
    // it — that would just recreate the same collision the redirect is
    // meant to avoid.
    const targetId = duplicateId ?? foodId
    await updateDoc(doc(db, 'users', user.uid, 'foods', targetId), {
      ...document,
      // `buildFoodDocument` simply omits `brand` when it's empty, which is
      // enough for a brand-new document — but `updateDoc` never removes a
      // field just because the payload doesn't mention it, so clearing an
      // existing brand needs an explicit delete sentinel here.
      brand: document.brand ?? deleteField(),
    })
    navigate('/foods')
  }

  async function handleDelete() {
    const user = auth.currentUser
    if (!user || !foodId) return

    await deleteDoc(doc(db, 'users', user.uid, 'foods', foodId))
    navigate('/foods')
  }

  if (notFound) {
    return (
      <section className="page page-center">
        <h1>Food not found</h1>
      </section>
    )
  }

  if (!values) {
    return (
      <PageLayout header={<h1>Edit Food</h1>}>
        <LoadingIndicator />
      </PageLayout>
    )
  }

  if (pendingSubmitted) {
    return (
      <PageLayout header={<h1>Edit Food</h1>}>
        <p>
          Your changes are pending approval from every other member of{' '}
          {gating?.groupName} before they take effect.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => navigate('/foods')}
        >
          Back to Foods
        </button>
      </PageLayout>
    )
  }

  return (
    <FoodForm
      key={foodId}
      title="Edit Food"
      submitLabel="Save Changes"
      savingLabel="Saving..."
      initialValues={values}
      onSubmit={handleSave}
      onDelete={handleDelete}
      resetOnSuccess={false}
      foodNameIndex={foodNameIndex}
      existingFoods={existingFoods}
      currentFoodId={foodId}
      gatingGroupName={gating?.groupName ?? null}
      addedFromHint={
        provenance ? describeAddedFrom(provenance.createdAt, provenance.addedFrom, dateFormat) : null
      }
    />
  )
}

export default EditFoodPage
