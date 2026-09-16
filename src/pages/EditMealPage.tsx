import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { deleteDoc, doc, getDoc, updateDoc } from 'firebase/firestore'
import { auth, db } from '../firebase.ts'
import LoadingIndicator from '../components/LoadingIndicator.tsx'
import MealForm from '../components/MealForm.tsx'
import PageLayout from '../components/PageLayout.tsx'
import { useRouteParam } from '../hooks/useRouteParam.ts'
import type { AddFoodNavResult } from '../lib/addFoodNav.ts'
import {
  buildMealDocument,
  mealDocumentToFormValues,
  type MealFormValues,
} from '../lib/meal.ts'
import type { FoodDocument, MealDocument, MealListItem } from '../types/food.ts'
import './pages.css'

function EditMealPage() {
  const mealId = useRouteParam('/meals/:mealId/edit', 'mealId')
  const navigate = useNavigate()
  const location = useLocation()
  // A plain per-render check, not a "once per mount" guard: MealForm itself
  // is what tracks whether it's already consumed this restore payload (see
  // its own last-applied-state ref) and clears location.state once it has.
  // This only needs to answer "is there a not-yet-cleared meal-restore
  // payload right now", which re-deriving from location.state on every
  // render already does correctly — the page never unmounts between one
  // restore and the next, so there's nothing here that needs to survive
  // across renders.
  // `'newFood' in state` distinguishes an inbound `AddFoodNavResult` from
  // the outbound `AddFoodNavRequest` MealForm briefly leaves in
  // location.state on its way to Add Food (both share `formKind: 'meal'`)
  // — see MealForm.tsx's identical check for why this matters now that
  // this page is permanently mounted.
  const restoreState = location.state as AddFoodNavResult | null
  const isRestoringMeal =
    restoreState?.formKind === 'meal' && 'newFood' in restoreState
  const [values, setValues] = useState<MealFormValues | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    const user = auth.currentUser
    if (!user || !mealId) return

    // See EditFoodPage.tsx's identical fix: clears the previous meal's
    // values immediately so switching directly between two meals' edit
    // pages doesn't seed the freshly `key`-remounted MealForm with stale
    // data through the async gap before this fetch resolves.
    setValues(null)

    getDoc(doc(db, 'users', user.uid, 'meals', mealId)).then((snapshot) => {
      if (!snapshot.exists()) {
        setNotFound(true)
        return
      }
      setValues(mealDocumentToFormValues(snapshot.data() as MealDocument))
    })
  }, [mealId])

  async function handleSave(
    formValues: MealFormValues,
    currentFoods: Record<string, FoodDocument>,
    allMeals: MealListItem[],
  ) {
    const user = auth.currentUser
    if (!user || !mealId) return

    await updateDoc(
      doc(db, 'users', user.uid, 'meals', mealId),
      buildMealDocument(formValues, currentFoods, allMeals, mealId),
    )
    navigate('/calendar', { state: { scrollToDate: formValues.date } })
  }

  async function handleDelete() {
    const user = auth.currentUser
    if (!user || !mealId) return

    await deleteDoc(doc(db, 'users', user.uid, 'meals', mealId))
    navigate('/calendar')
  }

  if (notFound) {
    return (
      <section className="page page-center">
        <h1>Meal not found</h1>
      </section>
    )
  }

  if (!values && !isRestoringMeal) {
    return (
      <PageLayout header={<h1>Edit Meal</h1>}>
        <LoadingIndicator />
      </PageLayout>
    )
  }

  return (
    <MealForm
      key={mealId}
      title="Edit Meal"
      submitLabel="Save Changes"
      savingLabel="Saving..."
      initialValues={values ?? undefined}
      mealId={mealId}
      onSubmit={handleSave}
      onDelete={handleDelete}
      resetOnSuccess={false}
    />
  )
}

export default EditMealPage
