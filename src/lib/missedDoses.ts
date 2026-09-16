import { addDays, toDateStr } from './timeline.ts'
import type { DoseListItem, DoseLogDocument } from '../types/doses.ts'

export type MissedDose = {
  doseId: string
  doseName: string
  dose: DoseListItem
  date: string
  /** This date's taken record as it stood (padded with `false` isn't done here — callers that need per-slot detail should pad themselves), so "Clear" can preserve it rather than overwrite with an empty array. */
  taken: boolean[]
}

/**
 * How far back to look for a dose saved before `createdAt` existed. This
 * app had no missed-dose tracking before `createdAt` was added, so there's
 * no real record of whether those older days were taken — asserting a long
 * backlog of "missed" days the app never actually watched would be an
 * unearned (and, for a medication tracker, an actively unhelpful) claim.
 * One day keeps the honest version of that: start tracking from here.
 */
export const MISSED_DOSE_FALLBACK_LOOKBACK_DAYS = 1

/**
 * Every (dose, past day) pair where the day has fully elapsed without every
 * dose for it being taken, and it hasn't been dismissed (`cleared`) either.
 * Applies to every dose, not just ones with configured `doseTimes` — once a
 * calendar day is over, "was it taken" is a yes/no question regardless of
 * whether specific times were set (unlike the same-day `upcoming`/`missed`
 * distinction in `computeDoseStatus`, which needs a time to judge against).
 */
export function computeMissedDoses(
  doses: DoseListItem[],
  logsByKey: Map<string, DoseLogDocument>,
  todayStr: string,
): MissedDose[] {
  const yesterday = addDays(todayStr, -1)
  const missed: MissedDose[] = []

  for (const dose of doses) {
    const dosesPerDay = Math.max(1, Number(dose.dosesPerDay) || 1)
    const startDate = dose.createdAt
      ? toDateStr(new Date(dose.createdAt))
      : addDays(todayStr, -MISSED_DOSE_FALLBACK_LOOKBACK_DAYS)

    let date = startDate
    while (date <= yesterday) {
      const log = logsByKey.get(`${dose.id}_${date}`)
      const taken = log?.taken ?? []
      const fullyTaken = Array.from(
        { length: dosesPerDay },
        (_, i) => taken[i] ?? false,
      ).every(Boolean)

      if (!fullyTaken && !log?.cleared) {
        missed.push({ doseId: dose.id, doseName: dose.name, dose, date, taken })
      }
      date = addDays(date, 1)
    }
  }

  return missed.sort(
    (a, b) => a.date.localeCompare(b.date) || a.doseName.localeCompare(b.doseName),
  )
}
