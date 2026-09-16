import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../firebase.ts'
import type { FoodRow } from '../lib/foodRow.ts'
import type { LeftoverChoice } from '../lib/leftovers.ts'
import type { FoodDocument, QuantityUnit, RecipeDocument } from '../types/food.ts'

export type FoodListItem = FoodDocument & { id: string }
export type RecipeListItem = RecipeDocument & { id: string }

export function useFoodRows(initialRows: FoodRow[] = []) {
  const [foods, setFoods] = useState<FoodListItem[]>([])
  const [recipes, setRecipes] = useState<RecipeListItem[]>([])
  const [rows, setRows] = useState<FoodRow[]>(initialRows)

  useEffect(() => {
    const user = auth.currentUser
    if (!user) return

    return onSnapshot(collection(db, 'users', user.uid, 'foods'), (snapshot) => {
      setFoods(
        snapshot.docs.map(
          (docSnapshot) =>
            ({ id: docSnapshot.id, ...docSnapshot.data() }) as FoodListItem,
        ),
      )
    })
  }, [])

  useEffect(() => {
    const user = auth.currentUser
    if (!user) return

    return onSnapshot(
      collection(db, 'users', user.uid, 'recipes'),
      (snapshot) => {
        setRecipes(
          snapshot.docs.map(
            (docSnapshot) =>
              ({ id: docSnapshot.id, ...docSnapshot.data() }) as RecipeListItem,
          ),
        )
      },
    )
  }, [])

  function addRow() {
    setRows((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        foodId: '',
        foodSnapshot: null,
        recipeId: '',
        recipeSnapshot: null,
        amount: '',
        unit: 'g',
      },
    ])
  }

  function addRowWithFood(food: FoodListItem) {
    setRows((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        foodId: food.id,
        foodSnapshot: food,
        recipeId: '',
        recipeSnapshot: null,
        amount: food.quantity.amount,
        unit: food.quantity.unit,
      },
    ])
  }

  function addRowWithRecipe(recipe: RecipeListItem) {
    setRows((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        foodId: '',
        foodSnapshot: null,
        recipeId: recipe.id,
        recipeSnapshot: recipe,
        amount: '1',
        unit: 'serving',
      },
    ])
  }

  function updateRowFood(id: string, foodId: string) {
    const food = foods.find((f) => f.id === foodId) ?? null
    setRows((current) =>
      current.map((row) =>
        row.id === id
          ? {
              ...row,
              foodId,
              foodSnapshot: food,
              recipeId: '',
              recipeSnapshot: null,
              amount: food ? food.quantity.amount : row.amount,
              unit: food ? food.quantity.unit : row.unit,
            }
          : row,
      ),
    )
  }

  function updateRowRecipe(id: string, recipeId: string) {
    const recipe = recipes.find((r) => r.id === recipeId) ?? null
    setRows((current) =>
      current.map((row) =>
        row.id === id
          ? {
              ...row,
              foodId: '',
              foodSnapshot: null,
              recipeId: recipe ? recipe.id : '',
              recipeSnapshot: recipe,
              amount: recipe ? '1' : row.amount,
              unit: recipe ? 'serving' : row.unit,
              // A different recipe means a different leftover ledger (and
              // possibly a different serving count) — start fresh.
              leftoverChoice: undefined,
            }
          : row,
      ),
    )
  }

  function updateRowAmount(id: string, amount: string) {
    setRows((current) =>
      current.map((row) =>
        row.id === id
          ? // Changing a recipe row's serving count invalidates any
            // meal-only ingredient override locked in at the old count, and
            // any leftover-tracking choice (whether it's enough to draw from
            // leftovers, or whether there's a surplus to reserve, both
            // depend on the count) — drop both so they're re-decided fresh.
            {
              ...row,
              amount,
              customFoods: row.recipeId ? null : row.customFoods,
              leftoverChoice: row.recipeId ? undefined : row.leftoverChoice,
            }
          : row,
      ),
    )
  }

  function updateRowLeftoverChoice(id: string, choice: LeftoverChoice) {
    setRows((current) =>
      current.map((row) =>
        row.id === id ? { ...row, leftoverChoice: choice } : row,
      ),
    )
  }

  function updateRowUnit(id: string, unit: QuantityUnit) {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, unit } : row)),
    )
  }

  function removeRow(id: string) {
    setRows((current) => current.filter((row) => row.id !== id))
  }

  return {
    foods,
    recipes,
    rows,
    setRows,
    addRow,
    addRowWithFood,
    addRowWithRecipe,
    updateRowFood,
    updateRowRecipe,
    updateRowAmount,
    updateRowUnit,
    updateRowLeftoverChoice,
    removeRow,
  }
}
