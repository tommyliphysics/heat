import { useEffect, useId, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import ConfirmDeleteModal from './ConfirmDeleteModal.tsx'
import EquipmentField from './EquipmentField.tsx'
import Icon from './Icon.tsx'
import PageLayout from './PageLayout.tsx'
import RecipeFoodRowsField from './RecipeFoodRowsField.tsx'
import { useFoodRows } from '../hooks/useFoodRows.ts'
import type { AddFoodNavResult } from '../lib/addFoodNav.ts'
import { isMealRecipeNavState } from '../lib/mealRecipeNav.ts'
import {
  EMPTY_RECIPE_FORM_VALUES,
  type RecipeFormValues,
} from '../lib/recipe.ts'
import '../pages/pages.css'

type RecipeFormProps = {
  title: string
  submitLabel: string
  savingLabel: string
  initialValues?: RecipeFormValues
  onSubmit: (values: RecipeFormValues) => Promise<void>
  onDelete?: () => Promise<void>
  resetOnSuccess?: boolean
  /** "Recipe added {date}[, from {source}]" (see `lib/food.ts`'s `describeAddedFrom`) — null when there's nothing to show, same as `FoodForm`'s identical prop. */
  addedFromHint?: string | null
}

function RecipeForm({
  title,
  submitLabel,
  savingLabel,
  initialValues,
  onSubmit,
  onDelete,
  resetOnSuccess = true,
  addedFromHint = null,
}: RecipeFormProps) {
  const location = useLocation()
  const navigate = useNavigate()
  // Add Recipe and Edit Recipe both use this component and are both
  // permanently mounted at once (see PageRegistry.tsx), so a plain static
  // id like "recipe-name" would collide between this form's own two
  // simultaneously-mounted instances — useId() gives each instance a
  // unique prefix instead.
  const formId = useId()
  const restoreResult = location.state as AddFoodNavResult | null
  // The `'newFood' in restoreResult` check matters now that this form is
  // permanently mounted (see PageRegistry.tsx): the moment this form's own
  // "create food inline" flow navigates to Add Food, `location.state`
  // briefly *is* the outbound `AddFoodNavRequest` — which shares
  // `formKind: 'recipe'` with the inbound `AddFoodNavResult` this code is
  // meant to react to, but has no `newFood`. Without this extra check, a
  // still-mounted (now hidden) RecipeForm would misread its own outbound
  // request as a completed result.
  const restoredRecipe =
    restoreResult?.formKind === 'recipe' && 'newFood' in restoreResult
      ? restoreResult
      : null
  const mealReturn = isMealRecipeNavState(location.state)
    ? location.state
    : null

  const start =
    restoredRecipe?.recipeValues ?? initialValues ?? EMPTY_RECIPE_FORM_VALUES
  const [deleteOpen, setDeleteOpen] = useState(false)

  const [name, setName] = useState(start.name)
  const [servings, setServings] = useState(start.servings)
  const [recipeText, setRecipeText] = useState(start.recipeText)
  const [equipment, setEquipment] = useState(start.equipment)
  const [handsOnTime, setHandsOnTime] = useState(start.handsOnTime)
  const [prepTime, setPrepTime] = useState(start.prepTime)
  const [cookTime, setCookTime] = useState(start.cookTime)
  const {
    foods,
    rows,
    setRows,
    addRowWithFood,
    updateRowAmount,
    updateRowUnit,
    removeRow,
  } = useFoodRows(start.rows)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Tracks the last-applied `location.state` (not just "have I ever
  // applied one") so a second "create food inline" round trip at an
  // already-mounted instance (the form no longer remounts per navigation —
  // see PageRegistry.tsx) is still picked up, not silently skipped.
  const lastAppliedState = useRef<unknown>(null)
  useEffect(() => {
    const state = location.state
    if (state === lastAppliedState.current || !restoredRecipe) return
    lastAppliedState.current = state

    const { newFood } = restoredRecipe
    setRows((current) => [
      ...current,
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
    navigate(location.pathname + location.search, { replace: true })
  }, [location.state, location.pathname, location.search, navigate, restoredRecipe, setRows])

  function handleCreateNewFood(query: string) {
    navigate('/add-food', {
      state: {
        formKind: 'recipe',
        recipeValues: {
          name,
          servings,
          rows,
          recipeText,
          equipment,
          handsOnTime,
          prepTime,
          cookTime,
        },
        returnTo: location.pathname + location.search,
        prefillName: query,
        navToken: crypto.randomUUID(),
      },
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await onSubmit({
        name,
        servings,
        rows,
        recipeText,
        equipment,
        handsOnTime,
        prepTime,
        cookTime,
      })

      if (resetOnSuccess) {
        setName('')
        setServings('')
        setRows([])
        setRecipeText('')
        setEquipment([])
        setHandsOnTime('')
        setPrepTime('')
        setCookTime('')
      }
    } catch {
      setError('Could not save this recipe. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageLayout
        header={
          <>
            {mealReturn ? (
              <button
                type="button"
                className="top-link"
                onClick={() =>
                  navigate(mealReturn.returnTo, {
                    state: {
                      mealFormReturn: true,
                      mealValues: mealReturn.mealValues,
                      returnTo: '',
                      navToken: crypto.randomUUID(),
                    },
                  })
                }
              >
                <Icon name="arrow-left" size={13} />
                Back to meal
              </button>
            ) : (
              <Link to="/recipes" className="top-link">
                <Icon name="book" size={13} />
                Recipes
              </Link>
            )}
            <div className="title-row">
              <h1>{title}</h1>
              {onDelete && (
                <button
                  type="button"
                  className="icon-btn icon-btn-danger"
                  onClick={() => setDeleteOpen(true)}
                  aria-label="Delete recipe"
                >
                  <Icon name="trash" size={16} />
                </button>
              )}
            </div>
          </>
        }
      >
        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor={`${formId}-recipe-name`}>Name</label>
          <input
            id={`${formId}-recipe-name`}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          {addedFromHint && <p className="form-hint">{addedFromHint}</p>}

          <label htmlFor={`${formId}-servings`}>Servings</label>
          <input
            id={`${formId}-servings`}
            type="number"
            value={servings}
            onChange={(e) => setServings(e.target.value)}
            required
          />

          <div className="field-row">
            <div>
              <label htmlFor={`${formId}-hands-on-time`}>Hands-on Time (min)</label>
              <input
                id={`${formId}-hands-on-time`}
                type="number"
                value={handsOnTime}
                onChange={(e) => setHandsOnTime(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor={`${formId}-prep-time`}>Prep Time (min)</label>
              <input
                id={`${formId}-prep-time`}
                type="number"
                value={prepTime}
                onChange={(e) => setPrepTime(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor={`${formId}-cook-time`}>Cook Time (min)</label>
              <input
                id={`${formId}-cook-time`}
                type="number"
                value={cookTime}
                onChange={(e) => setCookTime(e.target.value)}
              />
            </div>
          </div>

          <h2 className="form-section-heading">Ingredients</h2>

          <RecipeFoodRowsField
            rows={rows}
            foods={foods}
            onAddFood={addRowWithFood}
            onCreateNewFood={handleCreateNewFood}
            onAmountChange={updateRowAmount}
            onUnitChange={updateRowUnit}
            onRemoveRow={removeRow}
          />

          <h2 className="form-section-heading">Required Equipment</h2>
          <p className="form-hint">
            Optional for a private recipe — required once it's shared with a
            group, so other members know what they'll need.
          </p>
          <EquipmentField items={equipment} onChange={setEquipment} />

          <h2 className="form-section-heading">Method</h2>

          <textarea
            id={`${formId}-recipe-text`}
            aria-label="Method"
            rows={8}
            value={recipeText}
            onChange={(e) => setRecipeText(e.target.value)}
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
          title="Delete Recipe?"
          message={`This will permanently delete "${name || 'this recipe'}". This can't be undone.`}
        />
      )}
    </>
  )
}

export default RecipeForm
