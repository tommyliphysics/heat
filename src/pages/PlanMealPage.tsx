import { useRef } from 'react'
import { matchPath, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { addDoc, collection } from 'firebase/firestore'
import { auth, db } from '../firebase.ts'
import MealForm from '../components/MealForm.tsx'
import {
  buildMealDocument,
  EMPTY_MEAL_FORM_VALUES,
  type MealFormValues,
} from '../lib/meal.ts'
import type { FoodDocument, MealListItem } from '../types/food.ts'

function PlanMealPage() {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  // Freezes at its last value while this page isn't the active route,
  // rather than tracking `?date=` live — `useSearchParams()` is global, so
  // this component (permanently mounted, see PageRegistry.tsx) re-renders
  // on every navigation, not just ones to /plan-meal. Without freezing,
  // navigating anywhere else would read a `?date=` that isn't even this
  // page's, changing MealForm's `key` below and silently discarding an
  // in-progress draft the moment the user leaves (see useRouteParam.ts for
  // the same fix applied to route params).
  const isActive = !!matchPath('/plan-meal', location.pathname)
  const lastDateParam = useRef<string | null>(null)
  if (isActive) {
    lastDateParam.current = searchParams.get('date')
  }
  const dateParam = lastDateParam.current

  async function handleSave(
    values: MealFormValues,
    currentFoods: Record<string, FoodDocument>,
    allMeals: MealListItem[],
  ) {
    const user = auth.currentUser
    if (!user) return

    await addDoc(
      collection(db, 'users', user.uid, 'meals'),
      buildMealDocument(values, currentFoods, allMeals, null),
    )
    navigate('/calendar', { state: { scrollToDate: values.date } })
  }

  return (
    <MealForm
      key={dateParam ?? 'new'}
      title="Add Meal"
      submitLabel="Save Meal"
      savingLabel="Saving..."
      initialValues={
        dateParam ? { ...EMPTY_MEAL_FORM_VALUES, date: dateParam } : undefined
      }
      onSubmit={handleSave}
    />
  )
}

export default PlanMealPage
