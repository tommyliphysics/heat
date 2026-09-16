import type {
  CustomScheduleEntry,
  DoseListItem,
  DoseRepeatRule,
  RepeatUnit,
} from '../types/doses.ts'

/** Defensive cap on how many occurrences one entry's repeat rule can expand to, so a pathological config (e.g. "every 1 minute for 2 years") truncates instead of hanging or blowing up memory. Form validation should discourage configs anywhere near this in practice. */
export const MAX_OCCURRENCES_PER_ENTRY = 2000

export type ScheduledOccurrence = {
  entryId: string
  occurrenceIndex: number
  /** Epoch ms, built from local date/time components — not string arithmetic — so intervals correctly cross midnight and DST-shifted days. */
  at: number
  doseCount: number
}

const MS_PER_UNIT: Record<RepeatUnit, number> = {
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
}

function toMs(value: string, unit: RepeatUnit): number {
  return (Number(value) || 0) * MS_PER_UNIT[unit]
}

function anchorTime(entry: CustomScheduleEntry): number {
  const [year, month, day] = entry.date.split('-').map(Number)
  const [hour, minute] = entry.time.split(':').map(Number)
  return new Date(year, (month || 1) - 1, day || 1, hour || 0, minute || 0, 0, 0).getTime()
}

function occurrencesFromRepeat(
  entryId: string,
  anchor: number,
  doseCount: number,
  repeat: DoseRepeatRule,
): ScheduledOccurrence[] {
  const everyMs = toMs(repeat.everyValue, repeat.everyUnit)
  const forMs = toMs(repeat.forValue, repeat.forUnit)

  if (everyMs <= 0) {
    return [{ entryId, occurrenceIndex: 0, at: anchor, doseCount }]
  }

  const occurrences: ScheduledOccurrence[] = []
  let occurrenceIndex = 0
  let at = anchor
  while (at <= anchor + forMs && occurrences.length < MAX_OCCURRENCES_PER_ENTRY) {
    occurrences.push({ entryId, occurrenceIndex, at, doseCount })
    occurrenceIndex++
    at = anchor + occurrenceIndex * everyMs
  }
  return occurrences
}

/** Every occurrence one custom schedule entry expands to — a single occurrence if it has no `repeat`, or one per step of the bounded "every X for Y" rule (inclusive of both ends). */
export function generateEntryOccurrences(entry: CustomScheduleEntry): ScheduledOccurrence[] {
  const anchor = anchorTime(entry)
  const doseCount = Math.max(1, Number(entry.doseCount) || 1)

  if (!entry.repeat) {
    return [{ entryId: entry.id, occurrenceIndex: 0, at: anchor, doseCount }]
  }

  return occurrencesFromRepeat(entry.id, anchor, doseCount, entry.repeat)
}

/** Every occurrence across a dose's full custom schedule, sorted ascending by time. Returns `[]` for a recurring (or schedule-type-unset) dose — occurrence math only applies to `scheduleType === 'custom'`. */
export function generateDoseOccurrences(dose: DoseListItem): ScheduledOccurrence[] {
  if (dose.scheduleType !== 'custom' || !dose.customSchedule) return []
  return dose.customSchedule
    .flatMap((entry) => generateEntryOccurrences(entry))
    .sort((a, b) => a.at - b.at)
}

/** The deterministic `customDoseLogs` doc id for one occurrence — the single source of truth shared by both the write path (`lib/customDoseLog.ts`) and the query path (`hooks/useCustomDoseLogs.ts`), so they can never drift apart. */
export function occurrenceLogId(doseId: string, entryId: string, occurrenceIndex: number): string {
  return `${doseId}_custom_${entryId}_${occurrenceIndex}`
}
