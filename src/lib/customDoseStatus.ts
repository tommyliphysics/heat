import { generateDoseOccurrences, occurrenceLogId, type ScheduledOccurrence } from './customSchedule.ts'
import type { CustomDoseLogDocument, DoseListItem } from '../types/doses.ts'

export type CustomDoseStatus =
  | { kind: 'none' }
  | { kind: 'taken' }
  | { kind: 'upcoming'; occurrence: ScheduledOccurrence }
  | { kind: 'missed'; occurrence: ScheduledOccurrence }

/**
 * A custom-schedule dose's current status, mirroring `doseStatus.ts`'s
 * `computeDoseStatus` shape: the earliest occurrence that's neither taken
 * nor cleared decides the status (`upcoming` if still ahead of `now`,
 * `missed` if not); `taken` once every occurrence is resolved;
 * `none` when the dose has no occurrences at all (empty schedule).
 * Unlike a recurring dose, every custom occurrence always has a concrete
 * time, so there's no time-ambiguous "untaken" case to fall back to.
 */
export function computeCustomDoseStatus(
  dose: DoseListItem,
  logsByOccurrenceId: Map<string, CustomDoseLogDocument>,
  now: Date,
): CustomDoseStatus {
  const occurrences = generateDoseOccurrences(dose)
  if (occurrences.length === 0) return { kind: 'none' }

  const nowMs = now.getTime()
  let anyTaken = false

  for (const occurrence of occurrences) {
    const log = logsByOccurrenceId.get(
      occurrenceLogId(dose.id, occurrence.entryId, occurrence.occurrenceIndex),
    )
    if (log?.taken) {
      anyTaken = true
      continue
    }
    if (log?.cleared) continue

    return occurrence.at > nowMs
      ? { kind: 'upcoming', occurrence }
      : { kind: 'missed', occurrence }
  }

  return anyTaken ? { kind: 'taken' } : { kind: 'none' }
}

export type MissedOccurrence = {
  doseId: string
  doseName: string
  dose: DoseListItem
  entryId: string
  occurrenceIndex: number
  at: number
  doseCount: number
}

/**
 * Every past, un-taken, non-cleared occurrence across the given (expected
 * to be custom-schedule-only) doses — the occurrence-based analog of
 * `missedDoses.ts`'s `computeMissedDoses`.
 */
export function computeMissedOccurrences(
  doses: DoseListItem[],
  logsByOccurrenceId: Map<string, CustomDoseLogDocument>,
  now: Date,
): MissedOccurrence[] {
  const nowMs = now.getTime()
  const missed: MissedOccurrence[] = []

  for (const dose of doses) {
    for (const occurrence of generateDoseOccurrences(dose)) {
      if (occurrence.at >= nowMs) continue
      const log = logsByOccurrenceId.get(
        occurrenceLogId(dose.id, occurrence.entryId, occurrence.occurrenceIndex),
      )
      if (log?.taken || log?.cleared) continue

      missed.push({
        doseId: dose.id,
        doseName: dose.name,
        dose,
        entryId: occurrence.entryId,
        occurrenceIndex: occurrence.occurrenceIndex,
        at: occurrence.at,
        doseCount: occurrence.doseCount,
      })
    }
  }

  return missed.sort((a, b) => a.at - b.at || a.doseName.localeCompare(b.doseName))
}
