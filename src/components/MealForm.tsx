import { useEffect, useId, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { collection, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../firebase.ts'
import ConfirmDeleteModal from './ConfirmDeleteModal.tsx'
import FoodRowsField from './FoodRowsField.tsx'
import Icon from './Icon.tsx'
import PageLayout from './PageLayout.tsx'
import RecipeRowIngredientsModal from './RecipeRowIngredientsModal.tsx'
import { useFoodRows } from '../hooks/useFoodRows.ts'
import type { AddFoodNavResult } from '../lib/addFoodNav.ts'
import type { FoodRow } from '../lib/foodRow.ts'
import { EMPTY_MEAL_FORM_VALUES, type MealFormValues } from '../lib/meal.ts'
import {
  isMealRecipeNavState,
  type MealRecipeNavState,
} from '../lib/mealRecipeNav.ts'
import type { FoodDocument, MealListItem, MealTime } from '../types/food.ts'
import '../pages/pages.css'

type MealFormProps = {
  title: string
  submitLabel: string
  savingLabel: string
  initialValues?: MealFormValues
  /** The meal being edited, so its own (previously saved) entries don't count against themselves in a recipe's leftover ledger. Omit for a brand-new meal. */
  mealId?: string
  onSubmit: (
    values: MealFormValues,
    currentFoods: Record<string, FoodDocument>,
    allMeals: MealListItem[],
  ) => Promise<void>
  onDelete?: () => Promise<void>
  resetOnSuccess?: boolean
}

function MealForm({
  title,
  submitLabel,
  savingLabel,
  initialValues,
  mealId,
  onSubmit,
  onDelete,
  resetOnSuccess = true,
}: MealFormProps) {
  const location = useLocation()
  const navigate = useNavigate()
  // Add Meal and Edit Meal both use this component and are both
  // permanently mounted at once (see PageRegistry.tsx), so a plain static
  // id like "date" would collide between this form's own two
  // simultaneously-mounted instances — useId() gives each instance a
  // unique prefix instead.
  const formId = useId()
  const restoreResult = location.state as AddFoodNavResult | null
  // The `'newFood' in restoreResult` check matters now that this form is
  // permanently mounted (see PageRegistry.tsx): the moment this form's own
  // "create food inline" flow navigates to Add Food, `location.state`
  // briefly *is* the outbound `AddFoodNavRequest` — which shares
  // `formKind: 'meal'` with the inbound `AddFoodNavResult` this code is
  // meant to react to, but has no `newFood`. Without this extra check, a
  // still-mounted (now hidden) MealForm would misread its own outbound
  // request as a completed result and crash on `newFood.id` below.
  const restoredMeal =
    restoreResult?.formKind === 'meal' && 'newFood' in restoreResult
      ? restoreResult
      : null
  const recipeReturnState = isMealRecipeNavState(location.state)
    ? location.state
    : null

  const start =
    restoredMeal?.mealValues ??
    recipeReturnState?.mealValues ??
    initialValues ??
    EMPTY_MEAL_FORM_VALUES
  const [deleteOpen, setDeleteOpen] = useState(false)

  const [date, setDate] = useState(start.date)
  const [mealTime, setMealTime] = useState<MealTime>(start.time)
  const {
    foods,
    recipes,
    rows,
    setRows,
    addRow,
    updateRowFood,
    updateRowRecipe,
    updateRowAmount,
    updateRowUnit,
    updateRowLeftoverChoice,
    removeRow,
  } = useFoodRows(start.rows)

  const [allMeals, setAllMeals] = useState<MealListItem[]>([])
  useEffect(() => {
    const user = auth.currentUser
    if (!user) return

    return onSnapshot(collection(db, 'users', user.uid, 'meals'), (snapshot) => {
      setAllMeals(
        snapshot.docs.map(
          (docSnapshot) =>
            ({ id: docSnapshot.id, ...docSnapshot.data() }) as MealListItem,
        ),
      )
    })
  }, [])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [recipeEditRowId, setRecipeEditRowId] = useState<string | null>(null)
  const [recipeEditRestoreRows, setRecipeEditRestoreRows] = useState<
    FoodRow[] | null
  >(null)

  // Applies whichever restored state the form was mounted with — either a
  // newly created food (from `restoredMeal`) or nothing further to apply
  // beyond the meal values `start` already seeded (from `recipeReturnState`,
  // returning from "Edit in my recipes") — then clears it from location.state
  // either way, so a refresh or browser-back doesn't re-trigger it.
  // Tracks the last-applied `location.state` (not just "have I ever applied
  // one") so a second such round trip at an already-mounted instance (the
  // form no longer remounts per navigation — see PageRegistry.tsx) is still
  // picked up, not silently skipped.
  const lastAppliedState = useRef<unknown>(null)
  useEffect(() => {
    const state = location.state
    if (state === lastAppliedState.current) return
    if (!restoredMeal && !recipeReturnState) return
    lastAppliedState.current = state

    if (restoredMeal) {
      const { newFood, forRowId, recipeRowId, recipeIngredientRows } =
        restoredMeal

      if (recipeRowId) {
        // The new food was created from within a recipe row's meal-local
        // ingredient editor, not for a top-level row — reopen that editor
        // with its in-progress ingredients plus the food that was just added.
        setRecipeEditRestoreRows([
          ...(recipeIngredientRows ?? []),
          {
            id: crypto.randomUUID(),
            foodId: newFood.id,
            foodSnapshot: newFood,
            recipeId: '',
            recipeSnapshot: null,
            amount: newFood.quantity.amount,
            unit: newFood.quantity.unit,
          },
        ])
        setRecipeEditRowId(recipeRowId)
      } else {
        setRows((current) =>
          current.map((row) =>
            row.id === forRowId
              ? {
                  ...row,
                  foodId: newFood.id,
                  foodSnapshot: newFood,
                  recipeId: '',
                  recipeSnapshot: null,
                  amount: newFood.quantity.amount,
                  unit: newFood.quantity.unit,
                }
              : row,
          ),
        )
      }
    }

    navigate(location.pathname + location.search, { replace: true })
  }, [
    location.state,
    location.pathname,
    location.search,
    navigate,
    restoredMeal,
    recipeReturnState,
    setRows,
  ])

  useEffect(() => {
    if (recipes.length === 0) return
    setRows((current) => {
      let changed = false
      const next = current.map((row) => {
        if (row.recipeId && !row.recipeSnapshot) {
          const recipe = recipes.find((r) => r.id === row.recipeId)
          if (recipe) {
            changed = true
            return { ...row, recipeSnapshot: recipe }
          }
        }
        return row
      })
      return changed ? next : current
    })
  }, [recipes, setRows])

  function handleCreateNewFood(rowId: string, query: string) {
    navigate('/add-food', {
      state: {
        formKind: 'meal',
        mealValues: { date, time: mealTime, rows },
        forRowId: rowId,
        returnTo: location.pathname + location.search,
        prefillName: query,
        navToken: crypto.randomUUID(),
      },
    })
  }

  function openRecipeIngredientsModal(rowId: string) {
    setRecipeEditRestoreRows(null)
    setRecipeEditRowId(rowId)
  }

  const recipeEditRow = rows.find((row) => row.id === recipeEditRowId) ?? null

  function handleSaveIngredients(customFoods: Record<string, FoodDocument>) {
    setRows((current) =>
      current.map((row) =>
        row.id === recipeEditRowId ? { ...row, customFoods } : row,
      ),
    )
  }

  function handleRequestCreateIngredientFood(
    ingredientRows: FoodRow[],
    query: string,
  ) {
    navigate('/add-food', {
      state: {
        formKind: 'meal',
        mealValues: { date, time: mealTime, rows },
        forRowId: '',
        recipeRowId: recipeEditRowId,
        recipeIngredientRows: ingredientRows,
        returnTo: location.pathname + location.search,
        prefillName: query,
        navToken: crypto.randomUUID(),
      },
    })
  }

  function handleEditRecipeInMyRecipes(recipeId: string) {
    const navState: MealRecipeNavState = {
      mealFormReturn: true,
      mealValues: { date, time: mealTime, rows },
      returnTo: location.pathname + location.search,
      navToken: crypto.randomUUID(),
    }
    navigate(`/recipes/${recipeId}/edit`, { state: navState })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const currentFoods = Object.fromEntries(
        foods.map((food) => [food.id, food]),
      )
      await onSubmit({ date, time: mealTime, rows }, currentFoods, allMeals)

      if (resetOnSuccess) {
        setDate('')
        setMealTime('')
        setRows([])
      }
    } catch {
      setError('Could not save this meal. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageLayout
        header={
          <div className="title-row">
            <h1>{title}</h1>
            {onDelete && (
              <button
                type="button"
                className="icon-btn icon-btn-danger"
                onClick={() => setDeleteOpen(true)}
                aria-label="Delete meal"
              >
                <Icon name="trash" size={16} />
              </button>
            )}
          </div>
        }
      >
        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor={`${formId}-date`}>Date</label>
          <input
            id={`${formId}-date`}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />

          <label htmlFor={`${formId}-time`}>Time</label>
          <select
            id={`${formId}-time`}
            value={mealTime}
            onChange={(e) => setMealTime(e.target.value as MealTime)}
          >
            <option value=""></option>
            <option value="breakfast">Breakfast</option>
            <option value="lunch">Lunch</option>
            <option value="dinner">Dinner</option>
            <option value="snack">Snack</option>
            <option value="drink">Drink</option>
          </select>

          <FoodRowsField
            rows={rows}
            foods={foods}
            recipes={recipes}
            onAddRow={addRow}
            onFoodChange={updateRowFood}
            onRecipeChange={updateRowRecipe}
            onCreateNewFood={handleCreateNewFood}
            onAmountChange={updateRowAmount}
            onUnitChange={updateRowUnit}
            onRemoveRow={removeRow}
            allMeals={allMeals}
            mealDate={date}
            mealTime={mealTime}
            excludeMealId={mealId ?? null}
            onLeftoverChoiceChange={updateRowLeftoverChoice}
            onEditIngredients={openRecipeIngredientsModal}
          />

          {error && <p className="form-error">{error}</p>}

          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? savingLabel : submitLabel}
          </button>
        </form>
      </PageLayout>

      {onDelete && (
        <ConfirmDeleteModal
          open={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          onConfirm={onDelete}
          title="Delete Meal?"
          message={`This will permanently delete "${date || 'this meal'}". This can't be undone.`}
        />
      )}

      {recipeEditRow && (
        <RecipeRowIngredientsModal
          open={true}
          onClose={() => setRecipeEditRowId(null)}
          row={recipeEditRow}
          restoreRows={recipeEditRestoreRows}
          onRestoreRowsConsumed={() => setRecipeEditRestoreRows(null)}
          onRequestCreateFood={handleRequestCreateIngredientFood}
          onSave={handleSaveIngredients}
          onEditInMyRecipes={handleEditRecipeInMyRecipes}
        />
      )}
    </>
  )
}

export default MealForm
