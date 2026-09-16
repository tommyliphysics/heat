import { useState } from 'react'
import FoodAutocomplete from './FoodAutocomplete.tsx'
import Icon from './Icon.tsx'
import type { FoodListItem, RecipeListItem } from '../hooks/useFoodRows.ts'
import { buildMealEntries, type FoodRow } from '../lib/foodRow.ts'
import {
  computeLeftoverLedger,
  NO_LEFTOVER_CHOICE,
  type LeftoverChoice,
} from '../lib/leftovers.ts'
import { useUserSettings } from '../hooks/useUserSettings.ts'
import { formatShortDate } from '../lib/timeline.ts'
import {
  compatibleQuantityUnits,
  foodServingLabel,
  formatUnitLabel,
} from '../lib/units.ts'
import type { MealListItem, MealTime, QuantityUnit } from '../types/food.ts'

type FoodRowsFieldProps = {
  rows: FoodRow[]
  foods: FoodListItem[]
  recipes: RecipeListItem[]
  onAddRow: () => void
  onFoodChange: (id: string, foodId: string) => void
  onRecipeChange: (id: string, recipeId: string) => void
  onCreateNewFood: (id: string, query: string) => void
  onAmountChange: (id: string, amount: string) => void
  onUnitChange: (id: string, unit: QuantityUnit) => void
  onRemoveRow: (id: string) => void
  /** All of the user's meals (any date), the meal being planned/edited's own date+time, and its own id (so its previously-saved entries don't count against themselves) — used to work out where each recipe row sits in that recipe's leftover-tracking ledger. See `lib/leftovers.ts`. */
  allMeals: MealListItem[]
  mealDate: string
  mealTime: MealTime
  excludeMealId: string | null
  onLeftoverChoiceChange: (id: string, choice: LeftoverChoice) => void
  /** Opens the meal-local ingredient editor (quantities, add/remove) for a recipe row — see `RecipeRowIngredientsModal`. */
  onEditIngredients: (id: string) => void
}

type RecipeLeftoverControlsProps = {
  row: FoodRow
  allMeals: MealListItem[]
  mealDate: string
  mealTime: MealTime
  excludeMealId: string | null
  onChange: (choice: LeftoverChoice) => void
}

/**
 * Offers the leftover-tracking checkbox(es) for a recipe row once it has a
 * recipe, a serving count, and a meal date to place it in the ledger. Which
 * checkbox(es) appear depends on the recipe's current ledger state (see
 * `computeLeftoverLedger`): "Reserve leftovers for a future date" when
 * cooking fresh would leave some over; "Use leftovers from [date]" when an
 * earlier cook already has some open, plus the reserve checkbox too if that
 * leftover isn't enough and the shortfall needs cooking anyway.
 */
function RecipeLeftoverControls({
  row,
  allMeals,
  mealDate,
  mealTime,
  excludeMealId,
  onChange,
}: RecipeLeftoverControlsProps) {
  const { dateFormat } = useUserSettings()

  if (!row.recipeSnapshot || !row.recipeId || !mealDate) return null

  const recipeServings = Number(row.recipeSnapshot.servings) || 0
  const servingsEntered = Number(row.amount) || 0
  if (!recipeServings || !servingsEntered) return null

  const isExactMultiple = servingsEntered % recipeServings === 0
  const choice = row.leftoverChoice ?? NO_LEFTOVER_CHOICE
  const ledger = computeLeftoverLedger(
    row.recipeId,
    recipeServings,
    allMeals,
    excludeMealId,
    mealDate,
    mealTime,
  )

  if (ledger.status === 'dirty') {
    const shortfall = choice.usesLeftovers && servingsEntered > ledger.remaining
    // Not gated on `isExactMultiple` here — with the old batch always
    // getting claimed once "use leftovers" is checked, whether reserving
    // the new cook's surplus is a no-op depends on the shortfall amount,
    // not directly on the servings entered, so it's simplest (and safe) to
    // just always offer the choice whenever a fresh cook is happening.
    const showReserve = !choice.usesLeftovers || shortfall

    return (
      <div className="leftover-controls">
        <label className="leftover-checkbox">
          <input
            type="checkbox"
            checked={choice.usesLeftovers}
            onChange={(e) =>
              onChange({ ...choice, usesLeftovers: e.target.checked })
            }
          />
          Use leftovers from {formatShortDate(ledger.sinceDate, dateFormat)} (
          {ledger.remaining} left)
        </label>
        {showReserve && (
          <label className="leftover-checkbox">
            <input
              type="checkbox"
              checked={choice.reserveSurplus}
              onChange={(e) =>
                onChange({ ...choice, reserveSurplus: e.target.checked })
              }
            />
            Reserve leftovers for a future date
          </label>
        )}
      </div>
    )
  }

  if (isExactMultiple) return null

  return (
    <div className="leftover-controls">
      <label className="leftover-checkbox">
        <input
          type="checkbox"
          checked={choice.reserveSurplus}
          onChange={(e) =>
            onChange({ ...choice, reserveSurplus: e.target.checked })
          }
        />
        Reserve leftovers for a future date
      </label>
    </div>
  )
}

function FoodRowsField({
  rows,
  foods,
  recipes,
  onAddRow,
  onFoodChange,
  onRecipeChange,
  onCreateNewFood,
  onAmountChange,
  onUnitChange,
  onRemoveRow,
  allMeals,
  mealDate,
  mealTime,
  excludeMealId,
  onLeftoverChoiceChange,
  onEditIngredients,
}: FoodRowsFieldProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  function toggleExpanded(id: string) {
    setExpandedRows((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  return (
    <>
      {rows.map((row) => {
        const isExpanded = expandedRows.has(row.id)
        const recipeEntry =
          row.recipeSnapshot && isExpanded ? buildMealEntries([row])[0] : undefined
        const recipeFoods =
          recipeEntry?.kind === 'recipe' ? recipeEntry.foods : []

        return (
          <div key={row.id}>
            <div className="meal-food-row">
              {row.recipeSnapshot && (
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => toggleExpanded(row.id)}
                  aria-label={
                    isExpanded ? 'Collapse recipe ingredients' : 'Expand recipe ingredients'
                  }
                >
                  <Icon
                    name="chevron-down"
                    size={14}
                    className={isExpanded ? undefined : 'icon-collapsed'}
                  />
                </button>
              )}
              <FoodAutocomplete
                foods={foods}
                recipes={recipes}
                selectedName={row.foodSnapshot?.name ?? row.recipeSnapshot?.name ?? ''}
                onSelectFood={(foodId) => onFoodChange(row.id, foodId)}
                onSelectRecipe={(recipeId) => onRecipeChange(row.id, recipeId)}
                onCreateNew={(query) => onCreateNewFood(row.id, query)}
              />
              {(row.foodSnapshot || row.recipeSnapshot) && (
                <>
                  <input
                    type="number"
                    placeholder="Amount"
                    aria-label="Amount"
                    value={row.amount}
                    onChange={(e) => onAmountChange(row.id, e.target.value)}
                  />
                  {row.recipeSnapshot ? (
                    <select aria-label="Unit" value="serving" disabled>
                      <option value="serving">servings</option>
                    </select>
                  ) : (
                    <select
                      aria-label="Unit"
                      value={row.unit}
                      onChange={(e) =>
                        onUnitChange(row.id, e.target.value as QuantityUnit)
                      }
                    >
                      {compatibleQuantityUnits(row.foodSnapshot!).map((u) => (
                        <option key={u} value={u}>
                          {u === 'serving'
                            ? foodServingLabel(row.foodSnapshot!.servingSize)
                            : formatUnitLabel(u)}
                        </option>
                      ))}
                    </select>
                  )}
                </>
              )}
              <button
                type="button"
                className="icon-btn"
                onClick={() => onRemoveRow(row.id)}
                aria-label={`Remove ${row.foodSnapshot?.name ?? row.recipeSnapshot?.name ?? 'food'}`}
              >
                &times;
              </button>
            </div>

            {row.recipeSnapshot && (
              <RecipeLeftoverControls
                row={row}
                allMeals={allMeals}
                mealDate={mealDate}
                mealTime={mealTime}
                excludeMealId={excludeMealId}
                onChange={(choice) => onLeftoverChoiceChange(row.id, choice)}
              />
            )}

            {row.recipeSnapshot && isExpanded && (
              <div className="recipe-row-ingredients">
                {recipeFoods.map((food) => {
                  const foodDoc = foods.find((f) => f.id === food.foodId)
                  const unitLabel =
                    food.unit === 'serving' && foodDoc
                      ? foodServingLabel(foodDoc.servingSize)
                      : formatUnitLabel(food.unit)
                  return (
                    <div className="recipe-row-ingredient" key={food.foodId}>
                      <button
                        type="button"
                        className="meal-entry-ingredient-link"
                        onClick={() => onEditIngredients(row.id)}
                      >
                        {food.name} — {food.amount}
                        {unitLabel}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      <button
        type="button"
        className="btn btn-secondary btn-full"
        onClick={onAddRow}
      >
        + Add food
      </button>
    </>
  )
}

export default FoodRowsField
