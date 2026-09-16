import type { FoodFormValues } from './food.ts'
import type { FoodRow } from './foodRow.ts'
import type { MealFormValues } from './meal.ts'
import type { RecipeFormValues } from './recipe.ts'
import type { AddedFromInfo, FoodDocument } from '../types/food.ts'

/**
 * Carried as router navigation state when a meal/recipe form (or the
 * calendar's per-meal recipe editor) sends the user to Add Food from a
 * "food not found" search, so the in-progress form isn't lost. `returnTo` is
 * where Add Food navigates back to on success.
 */
export type AddFoodNavRequest =
  | {
      formKind: 'meal'
      mealValues: MealFormValues
      forRowId: string
      returnTo: string
      prefillName: string
      /**
       * Set when the new food is being added to a recipe row's meal-local
       * ingredient list (the Edit/Plan Meal page's own "edit ingredients for
       * this meal only" editor) instead of directly onto `forRowId` — the id
       * of that recipe row, and its in-progress ingredient rows to restore.
       */
      recipeRowId?: string
      recipeIngredientRows?: FoodRow[]
      /** A fresh `crypto.randomUUID()` per request, minted by the sender — see `AddFoodPage`'s use of it as a React `key`, so a second, distinct "create food inline" request arriving at an already-mounted Add Food page (it no longer remounts per navigation, see `PageRegistry.tsx`) correctly resets the form instead of reusing whatever was left over from the previous request. */
      navToken: string
    }
  | {
      formKind: 'recipe'
      recipeValues: RecipeFormValues
      returnTo: string
      prefillName: string
      navToken: string
    }
  | {
      formKind: 'mealRecipeOverride'
      mealId: string
      entryIndex: number
      ingredientRows: FoodRow[]
      returnTo: string
      prefillName: string
      navToken: string
    }
  | {
      /** From the Foods page's Connections or Reference tab — "Add to My Foods" on a single item. Unlike the other variants, there's no in-progress caller form to restore, so this carries the *entire* prefilled form (not just a name) and needs no `AddFoodNavResult` counterpart: `AddFoodPage` just navigates back to `returnTo` on save, since the Foods page picks the new food up from its own live listener rather than needing it handed back. */
      formKind: 'import'
      prefillValues: FoodFormValues
      addedFrom: AddedFromInfo
      returnTo: string
      navToken: string
    }

/** Carried back from Add Food to the originating meal/recipe form (or per-meal recipe editor) on save — no `'import'` counterpart here, see that variant's own doc comment above. */
export type AddFoodNavResult =
  | {
      formKind: 'meal'
      mealValues: MealFormValues
      forRowId: string
      recipeRowId?: string
      recipeIngredientRows?: FoodRow[]
      newFood: FoodDocument & { id: string }
    }
  | {
      formKind: 'recipe'
      recipeValues: RecipeFormValues
      newFood: FoodDocument & { id: string }
    }
  | {
      formKind: 'mealRecipeOverride'
      mealId: string
      entryIndex: number
      ingredientRows: FoodRow[]
      newFood: FoodDocument & { id: string }
    }
