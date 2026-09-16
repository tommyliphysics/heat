import type { RecipeFormValues } from './recipe.ts'
import type { AddedFromInfo } from '../types/food.ts'

/**
 * Carried as router navigation state when the Recipes page's Connections tab
 * sends the user to Add Recipe pre-filled with a shared recipe's data — the
 * recipe equivalent of `AddFoodNavRequest`'s `'import'` variant. There's
 * only ever this one shape today (unlike Foods, Add Recipe has no other
 * pre-fill flow to fit alongside), so this isn't a discriminated union.
 */
export type AddRecipeNavRequest = {
  formKind: 'import'
  prefillValues: RecipeFormValues
  addedFrom: AddedFromInfo
  returnTo: string
  navToken: string
}
