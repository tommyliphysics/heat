import { MEAL_TIME_ORDER } from './timeline.ts'
import type { MealListItem, MealTime } from '../types/food.ts'

export type LeftoverLedgerState =
  | { status: 'clean' }
  | { status: 'dirty'; sinceDate: string; remaining: number }

/** The user's choices for a recipe meal entry that has gone through the leftover-tracking UI. */
export type LeftoverChoice = {
  /** "Use leftovers from [date]" — draw this entry's servings from an already-open batch instead of cooking. Only meaningful when the ledger is dirty. */
  usesLeftovers: boolean
  /** "Reserve leftovers for a future date" — keep tracking whatever this cook doesn't use up today, so a later entry can draw on it. */
  reserveSurplus: boolean
}

export const NO_LEFTOVER_CHOICE: LeftoverChoice = {
  usesLeftovers: false,
  reserveSurplus: false,
}

type RecipeUsageEvent = {
  date: string
  time: MealTime
  mealId: string
  batchServings: number
}

function recipeUsageEvents(
  recipeId: string,
  meals: MealListItem[],
  excludeMealId: string | null,
): RecipeUsageEvent[] {
  const events: RecipeUsageEvent[] = []
  for (const meal of meals) {
    if (meal.id === excludeMealId) continue
    for (const entry of meal.entries ?? []) {
      if (entry.kind === 'recipe' && entry.recipeId === recipeId) {
        events.push({
          date: meal.date,
          time: meal.time,
          mealId: meal.id,
          batchServings: Number(entry.batchServings) || 0,
        })
      }
    }
  }

  events.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      MEAL_TIME_ORDER[a.time] - MEAL_TIME_ORDER[b.time] ||
      a.mealId.localeCompare(b.mealId),
  )
  return events
}

/**
 * Where a recipe's leftover-tracking ledger stands right before a meal entry
 * for it at `(beforeDate, beforeTime)` — walking every OTHER meal that's
 * used this recipe earlier than that point (oldest first), summing each
 * one's `batchServings` (0 for entries that opted out of tracking, or for
 * meals saved before this feature existed). The running total lands on a
 * multiple of the recipe's serving count whenever nothing is currently owed
 * as leftovers ("clean"); otherwise it's `remaining` servings short of the
 * next multiple ("dirty"), and `sinceDate` is the most recent date that
 * opened (or re-opened) that gap.
 */
export function computeLeftoverLedger(
  recipeId: string,
  servingsPerBatch: number,
  meals: MealListItem[],
  excludeMealId: string | null,
  beforeDate: string,
  beforeTime: MealTime,
): LeftoverLedgerState {
  if (!servingsPerBatch) return { status: 'clean' }

  const events = recipeUsageEvents(recipeId, meals, excludeMealId).filter(
    (event) =>
      event.date < beforeDate ||
      (event.date === beforeDate &&
        MEAL_TIME_ORDER[event.time] < MEAL_TIME_ORDER[beforeTime]),
  )

  let total = 0
  let openedAt: string | null = null
  for (const event of events) {
    const before = total % servingsPerBatch
    total += event.batchServings
    const after = total % servingsPerBatch
    if (before === 0 && after !== 0) openedAt = event.date
    if (after === 0) openedAt = null
  }

  const remainder = total % servingsPerBatch
  if (remainder === 0) return { status: 'clean' }
  return {
    status: 'dirty',
    sinceDate: openedAt ?? events[0]?.date ?? '',
    remaining: servingsPerBatch - remainder,
  }
}

/**
 * Resolves a recipe meal entry's leftover-ledger contribution and hands-on
 * time from the ledger state and the user's checkbox choices. Hands-on time
 * is never scaled by amount — it's either the recipe's full listed time (a
 * cook happened today) or zero (this entry is purely eating an
 * already-cooked batch); the ledger contribution (`batchServings`) is what
 * lets that decision carry forward correctly to whichever future entries
 * end up drawing on the same batch.
 */
export function resolveLeftoverEntry(
  ledger: LeftoverLedgerState,
  servingsEntered: number,
  fullHandsOnTime: string,
  choice: LeftoverChoice,
): { batchServings: string; handsOnTime: string } {
  if (ledger.status === 'dirty' && choice.usesLeftovers) {
    if (servingsEntered <= ledger.remaining) {
      return { batchServings: String(servingsEntered), handsOnTime: '0' }
    }
    // Not enough leftover to cover it — checking this box is what claims
    // the old batch, so it's always spent regardless of what happens next;
    // cooking fresh covers the shortfall. Whether that fresh cook's own
    // surplus stays trackable for later is the separate reserve choice —
    // declining it means this entry doesn't carry the new surplus forward,
    // only closes out the old batch it just claimed.
    return {
      batchServings: String(
        choice.reserveSurplus ? servingsEntered : ledger.remaining,
      ),
      handsOnTime: fullHandsOnTime,
    }
  }

  // Clean, or dirty but declined — cooking fresh today.
  return {
    batchServings: choice.reserveSurplus ? String(servingsEntered) : '0',
    handsOnTime: fullHandsOnTime,
  }
}

/** Best-effort reconstruction of a saved recipe entry's leftover choices, for pre-filling the checkboxes when re-opening it for edit — can't perfectly distinguish every case from just the two stored numbers, but lands on the same outcome that was saved. */
export function inferLeftoverChoice(
  batchServings: string | undefined,
  handsOnTime: string | undefined,
): LeftoverChoice {
  if (Number(handsOnTime) === 0 && (handsOnTime ?? '') !== '') {
    return { usesLeftovers: true, reserveSurplus: false }
  }
  if ((Number(batchServings) || 0) > 0) {
    return { usesLeftovers: false, reserveSurplus: true }
  }
  return NO_LEFTOVER_CHOICE
}
