import { useEffect, useRef } from 'react'
import Modal from './Modal.tsx'
import RecipeFoodRowsField from './RecipeFoodRowsField.tsx'
import { useFoodRows, type FoodListItem } from '../hooks/useFoodRows.ts'
import { buildFoodsMap, buildMealEntries, type FoodRow } from '../lib/foodRow.ts'
import type { FoodDocument, QuantityUnit } from '../types/food.ts'

type RecipeRowIngredientsModalProps = {
  open: boolean
  onClose: () => void
  /** The recipe row (from the Plan/Edit Meal form's own `rows`) whose ingredients are being adjusted for this meal only. */
  row: FoodRow
  /** Ingredient rows to restore after a round trip through Add Food (a new food was just created), plus a callback to clear them once applied. */
  restoreRows: FoodRow[] | null
  onRestoreRowsConsumed: () => void
  onRequestCreateFood: (ingredientRows: FoodRow[], query: string) => void
  /** Called with the resulting meal-local ingredient override on save — the caller applies it to the row's `customFoods`. */
  onSave: (customFoods: Record<string, FoodDocument>) => void
  /** "Edit in my recipes" — navigates to the full Edit Recipe page for this row's recipe, preserving the in-progress meal form so it's restored on return. */
  onEditInMyRecipes: (recipeId: string) => void
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

/**
 * The Plan/Edit Meal form's own version of the calendar's per-meal recipe
 * ingredient editor — lets the user adjust quantities (or add/remove
 * ingredients) for one recipe row, scoped to this meal only, before the
 * meal is even saved. Unlike the calendar's `RecipeMealEditModal`, this
 * never touches Firestore itself: it just resolves the row's `customFoods`
 * override and hands it back, since the enclosing form already owns saving
 * the whole meal.
 */
function RecipeRowIngredientsModal({
  open,
  onClose,
  row,
  restoreRows,
  onRestoreRowsConsumed,
  onRequestCreateFood,
  onSave,
  onEditInMyRecipes,
}: RecipeRowIngredientsModalProps) {
  const {
    foods,
    rows: ingredientRows,
    setRows: setIngredientRows,
    addRowWithFood,
    updateRowAmount,
    updateRowUnit,
    removeRow,
  } = useFoodRows()

  const openedFor = useRef<string | null>(null)

  // Seed the ingredient rows from this row's current ingredient list
  // (whichever it already resolves to via `buildMealEntries` — an existing
  // meal-local override, or the live recipe scaled to its servings), once
  // per opening.
  useEffect(() => {
    if (!open || !row.recipeSnapshot || restoreRows) return
    if (openedFor.current === row.id) return
    openedFor.current = row.id

    const entry = buildMealEntries([row])[0]
    const foodsById = Object.fromEntries(foods.map((f) => [f.id, f]))
    if (entry?.kind === 'recipe') {
      setIngredientRows(entry.foods.map((f) => entryFoodRow(f, foodsById)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, row, restoreRows])

  // Once the Foods collection finishes loading, hydrate any row whose
  // foodSnapshot came back null on the first pass (opened before it loaded).
  useEffect(() => {
    if (foods.length === 0) return
    setIngredientRows((current) => {
      let changed = false
      const next = current.map((r) => {
        if (r.foodId && !r.foodSnapshot) {
          const food = foods.find((f) => f.id === r.foodId)
          if (food) {
            changed = true
            return { ...r, foodSnapshot: food }
          }
        }
        return r
      })
      return changed ? next : current
    })
  }, [foods, setIngredientRows])

  // Restore in-progress ingredient rows (plus the newly created food) after
  // a round trip through Add Food.
  useEffect(() => {
    if (!restoreRows) return
    setIngredientRows(restoreRows)
    openedFor.current = row.id
    onRestoreRowsConsumed()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoreRows])

  useEffect(() => {
    if (!open) openedFor.current = null
  }, [open])

  if (!row.recipeSnapshot) return null
  const recipeId = row.recipeId

  function handleCreateNewFood(query: string) {
    onRequestCreateFood(ingredientRows, query)
  }

  function handleSave() {
    const foodsById = Object.fromEntries(foods.map((f) => [f.id, f]))
    onSave(buildFoodsMap(ingredientRows, foodsById))
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      titleId="recipe-row-ingredients-title"
      title={row.recipeSnapshot.name}
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

      <div className="toggle-group">
        <button type="button" className="toggle-option active">
          Edit for this meal only
        </button>
        <button
          type="button"
          className="toggle-option"
          onClick={() => onEditInMyRecipes(recipeId)}
        >
          Edit in my recipes
        </button>
      </div>

      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={handleSave}>
          Save
        </button>
      </div>
    </Modal>
  )
}

export default RecipeRowIngredientsModal
