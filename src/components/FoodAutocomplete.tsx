import { useEffect, useState } from 'react'
import Icon from './Icon.tsx'
import type { FoodListItem, RecipeListItem } from '../hooks/useFoodRows.ts'
import { foodDisplayName } from '../lib/food.ts'
import { matchesQuery } from '../lib/search.ts'

type FoodAutocompleteProps = {
  foods: FoodListItem[]
  recipes: RecipeListItem[]
  selectedName: string
  onSelectFood: (foodId: string) => void
  onSelectRecipe: (recipeId: string) => void
  onCreateNew: (query: string) => void
  /** Hides the "+ New Food" affordance on no results, showing a plain empty message instead — for contexts (e.g. reviewing a scanned receipt) where creating a food would navigate away and lose in-progress state; the caller offers its own way to handle an unmatched item instead. */
  allowCreate?: boolean
}

function FoodAutocomplete({
  foods,
  recipes,
  selectedName,
  onSelectFood,
  onSelectRecipe,
  onCreateNew,
  allowCreate = true,
}: FoodAutocompleteProps) {
  const [query, setQuery] = useState(selectedName)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setQuery(selectedName)
  }, [selectedName])

  const trimmed = query.trim()
  const foodResults = trimmed
    ? foods.filter((food) => matchesQuery(food.name, trimmed))
    : []
  const recipeResults = trimmed
    ? recipes.filter((recipe) => matchesQuery(recipe.name, trimmed))
    : []

  function handleSelectFood(food: FoodListItem) {
    onSelectFood(food.id)
    setQuery(food.name)
    setOpen(false)
  }

  function handleSelectRecipe(recipe: RecipeListItem) {
    onSelectRecipe(recipe.id)
    setQuery(recipe.name)
    setOpen(false)
  }

  function handleBlur() {
    setOpen(false)
    setQuery(selectedName)
  }

  return (
    <div className="food-autocomplete">
      <input
        type="text"
        aria-label="Food or recipe"
        placeholder="Search foods or recipes..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        autoComplete="off"
      />

      {open && trimmed && (
        <div className="food-autocomplete-menu">
          {foodResults.length > 0 || recipeResults.length > 0 ? (
            <ul className="food-search-results">
              {foodResults.map((food) => (
                <li key={`food-${food.id}`}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSelectFood(food)}
                  >
                    {foodDisplayName(food)}
                  </button>
                </li>
              ))}
              {recipeResults.map((recipe) => (
                <li key={`recipe-${recipe.id}`}>
                  <button
                    type="button"
                    className="food-search-result-recipe"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSelectRecipe(recipe)}
                  >
                    <Icon name="book" size={14} />
                    {recipe.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : allowCreate ? (
            <ul className="food-search-results">
              <li>
                <button
                  type="button"
                  className="food-search-result-new"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onCreateNew(query.trim())}
                >
                  <Icon name="plus" size={14} />
                  New Food
                </button>
              </li>
            </ul>
          ) : (
            <p className="food-search-empty">No matching foods.</p>
          )}
        </div>
      )}
    </div>
  )
}

export default FoodAutocomplete
