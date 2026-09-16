import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, updateDoc } from 'firebase/firestore'
import { auth, db } from '../firebase.ts'
import Modal from './Modal.tsx'
import RecipeFoodRowsField from './RecipeFoodRowsField.tsx'
import { useFoodRows, type FoodListItem } from '../hooks/useFoodRows.ts'
import {
  buildFoodsMap,
  buildMealEntries,
  mealToRows,
  type FoodRow,
} from '../lib/foodRow.ts'
import type { MealListItem, QuantityUnit } from '../types/food.ts'

type RecipeMealEditModalProps = {
  open: boolean
  onClose: () => void
  meal: MealListItem
  entryIndex: number
  /** Every one of the user's meals, so re-saving this one re-resolves each of its recipe rows' leftover-tracking state (see `lib/leftovers.ts`) correctly instead of resetting it. */
  allMeals: MealListItem[]
  /** Ingredient rows to restore after a round trip through Add Food (a new food was just created), plus a callback to clear them once applied. */
  restoreRows: FoodRow[] | null
  onRestoreRowsConsumed: () => void
  onRequestCreateFood: (ingredientRows: FoodRow[], query: string) => void
}

function entryFoodRow(
  entryFood: { foodId: string; amount: string; unit: QuantityUnit },
  foodsById: Record<string, FoodListItem>,
): FoodRow {
  return {
    id: crypto.randomUUID(),
    foodId: entryFood.foodId,
    foodSnapshot: foodsById[entryFood.foodId] ?? null,
    recipeId: '',
    recipeSnapshot: null,
    amount: entryFood.amount,
    unit: entryFood.unit,
  }
}

function RecipeMealEditModal({
  open,
  onClose,
  meal,
  entryIndex,
  allMeals,
  restoreRows,
  onRestoreRowsConsumed,
  onRequestCreateFood,
}: RecipeMealEditModalProps) {
  const navigate = useNavigate()
  const entry = meal.entries?.[entryIndex]
  const {
    foods,
    recipes,
    rows: ingredientRows,
    setRows: setIngredientRows,
    addRowWithFood,
    updateRowAmount,
    updateRowUnit,
    removeRow,
  } = useFoodRows()

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const openedFor = useRef<string | null>(null)

  // Seed the ingredient rows from this entry's current (possibly already
  // locally-overridden) ingredient list, once per modal opening — guarded by
  // a key rather than object identity so an unrelated Firestore update to
  // `meal` while the modal is open doesn't clobber in-progress edits.
  useEffect(() => {
    if (!open || !entry || entry.kind !== 'recipe' || restoreRows) return
    const key = `${meal.id}-${entryIndex}`
    if (openedFor.current === key) return
    openedFor.current = key

    const foodsById = Object.fromEntries(foods.map((f) => [f.id, f]))
    setIngredientRows(entry.foods.map((f) => entryFoodRow(f, foodsById)))
    setError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entry, meal.id, entryIndex, restoreRows])

  // Once the Foods collection finishes loading, hydrate any row whose
  // foodSnapshot came back null on the first pass (opened before it loaded).
  useEffect(() => {
    if (foods.length === 0) return
    setIngredientRows((current) => {
      let changed = false
      const next = current.map((row) => {
        if (row.foodId && !row.foodSnapshot) {
          const food = foods.find((f) => f.id === row.foodId)
          if (food) {
            changed = true
            return { ...row, foodSnapshot: food }
          }
        }
        return row
      })
      return changed ? next : current
    })
  }, [foods, setIngredientRows])

  // Restore in-progress ingredient rows (plus the newly created food) after
  // a round trip through Add Food.
  useEffect(() => {
    if (!restoreRows) return
    setIngredientRows(restoreRows)
    openedFor.current = `${meal.id}-${entryIndex}`
    onRestoreRowsConsumed()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoreRows])

  useEffect(() => {
    if (!open) openedFor.current = null
  }, [open])

  if (!entry || entry.kind !== 'recipe') return null
  const recipeId = entry.recipeId
  const recipeName = entry.name

  function handleCreateNewFood(query: string) {
    onRequestCreateFood(ingredientRows, query)
  }

  async function handleSave() {
    const user = auth.currentUser
    if (!user) return
    setError('')
    setSaving(true)
    try {
      const currentFoodsById = Object.fromEntries(foods.map((f) => [f.id, f]))
      const customFoods = buildFoodsMap(ingredientRows, currentFoodsById)

      // Rebuild every row for the whole meal (not just this entry) so
      // `foods`/`entries` stay consistent with the rest of the meal — the
      // same machinery MealForm uses — then inject this entry's local
      // override before recomputing.
      const allRows = mealToRows(meal).map((row) =>
        row.recipeId && !row.recipeSnapshot
          ? {
              ...row,
              recipeSnapshot: recipes.find((r) => r.id === row.recipeId) ?? null,
            }
          : row,
      )
      allRows[entryIndex] = { ...allRows[entryIndex], customFoods }

      await updateDoc(doc(db, 'users', user.uid, 'meals', meal.id), {
        foods: buildFoodsMap(allRows, currentFoodsById),
        entries: buildMealEntries(allRows, allMeals, meal.date, meal.time, meal.id),
      })
      onClose()
    } catch {
      setError('Could not save these changes. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  function handleEditInMyRecipes() {
    navigate(`/recipes/${recipeId}/edit`)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      titleId="recipe-meal-edit-title"
      title={recipeName}
    >
      <RecipeFoodRowsField
        rows={ingredientRows}
        foods={foods}
        onAddFood={addRowWithFood}
        onCreateNewFood={handleCreateNewFood}
        onAmountChange={updateRowAmount}
        onUnitChange={updateRowUnit}
        onRemoveRow={removeRow}
      />

      {error && <p className="form-error">{error}</p>}

      <div className="toggle-group">
        <button type="button" className="toggle-option active">
          Edit for this meal only
        </button>
        <button
          type="button"
          className="toggle-option"
          onClick={handleEditInMyRecipes}
        >
          Edit in my recipes
        </button>
      </div>

      <div className="modal-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onClose}
          disabled={saving}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </Modal>
  )
}

export default RecipeMealEditModal
