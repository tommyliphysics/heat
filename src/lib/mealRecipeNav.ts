import type { MealFormValues } from './meal.ts'

/**
 * Carried as router state when the meal form's per-row recipe-ingredient
 * editor sends the user to Edit Recipe via its "Edit in my recipes" toggle,
 * so the in-progress meal form (date, time, every row) isn't lost while the
 * user edits the shared recipe — restored when they save, delete, or
 * navigate back from there.
 */
export type MealRecipeNavState = {
  mealFormReturn: true
  mealValues: MealFormValues
  returnTo: string
  /** A fresh `crypto.randomUUID()` per send, minted by the sender — `MealForm` compares this (not the full state object's identity) when deciding whether it's a not-yet-applied restore, since this payload is deliberately re-sent by `EditRecipePage` back toward the originating meal form and could in principle be re-wrapped along the way. */
  navToken: string
}

export function isMealRecipeNavState(
  state: unknown,
): state is MealRecipeNavState {
  return (
    !!state &&
    typeof state === 'object' &&
    (state as { mealFormReturn?: unknown }).mealFormReturn === true
  )
}
