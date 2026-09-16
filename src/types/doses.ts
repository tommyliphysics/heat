import type { MicronutrientUnit } from './food.ts'

/** 'recurring' (today's model, driven by `dosesPerDay`/`doseTimes`) or 'custom' (driven by `customSchedule`). Absent means 'recurring' — every dose saved before this existed, and every recurring dose saved after, since a recurring save never writes this field. */
export type ScheduleType = 'recurring' | 'custom'

export type RepeatUnit = 'minutes' | 'hours' | 'days'

/** A bounded "repeat every X [unit] for Y [unit]" rule on one custom schedule entry. Both halves are always required — no open-ended repeats — so an entry's occurrence list is always finite and can be fully enumerated (see `lib/customSchedule.ts`). */
export type DoseRepeatRule = {
  everyValue: string
  everyUnit: RepeatUnit
  forValue: string
  forUnit: RepeatUnit
}

/**
 * One row of a dose's custom schedule: an anchor date/time at which
 * `doseCount` dose-units are taken together (one loggable occurrence, not
 * `doseCount` separate slots), optionally repeated at a fixed interval for a
 * bounded duration. `id` is minted once when the entry is created; editing
 * an entry's date/time/doseCount/repeat mints a NEW id for it rather than
 * mutating in place, so already-logged history for its old timing stays
 * frozen (see `lib/doses.ts#buildDoseDocument`) instead of being silently
 * relabeled under the new schedule.
 */
export type CustomScheduleEntry = {
  id: string
  /** 'YYYY-MM-DD' */
  date: string
  /** 'HH:MM', 24h */
  time: string
  doseCount: string
  repeat?: DoseRepeatRule
}

/** A supplement or medication the user takes daily. */
export type DoseDocument = {
  name: string
  /** Free text — e.g. "500mg" or "1 tablet". No unit conversion applies to doses, unlike food quantities. */
  dose: string
  scheduleType?: ScheduleType
  /** Numeric string, like other counts in this app (e.g. recipe servings). Only present/meaningful when `scheduleType` is 'recurring' (or unset). */
  dosesPerDay?: string
  /** Scheduled time of day ('HH:MM', 24h) for each dose, same length as `dosesPerDay` — the optional "Set dosage times" section. Omitted entirely when no times are set, in which case daily status is just taken/not-taken with no countdown/missed tracking. Only meaningful when `scheduleType` is 'recurring' (or unset). */
  doseTimes?: string[]
  /** Only present/meaningful when `scheduleType === 'custom'`; see `lib/customSchedule.ts` for occurrence generation. */
  customSchedule?: CustomScheduleEntry[]
  /** Per-dose micronutrient contribution, for supplements/meds that contribute to daily micronutrient totals. */
  micronutrients?: Record<string, { amount: string; unit: MicronutrientUnit }>
  /** Date.now() when this dose was created — the lower bound for scanning past days for missed doses (see `lib/missedDoses.ts`), so a day before the dose even existed is never flagged. Optional for backward compatibility with doses saved before this existed. */
  createdAt?: number
  /** Links this dose to an "Other" inventory batch (see `types/food.ts`) that tracks how many are left — set once a starting count is entered in Add/Edit Dose (`DoseFormValues.currentStock`). Its presence is what turns stock tracking on for this dose; taking a dose (see `lib/doseInventory.ts`) decrements the linked batch's remaining count by one each time. */
  inventoryBatchId?: string
  /** Warn (a persistent banner, see `DoseAlertBanners.tsx`) once the linked inventory batch's remaining count drops to or below this. Only meaningful when `inventoryBatchId` is set. Numeric string, like other counts in this app. */
  lowStockThreshold?: string
}

export type DoseListItem = DoseDocument & { id: string }

/**
 * One day's taken/not-taken record for one dose definition. Doc id is
 * `${doseId}_${date}` (deterministic, so toggling a dose is a single
 * `setDoc` with no query needed).
 */
export type DoseLogDocument = {
  doseId: string
  date: string
  /** taken[i] = whether dose #i (0-indexed) was taken this date. */
  taken: boolean[]
  /** Set once a past day's incomplete dose has been dismissed from the missed-doses list (see `lib/missedDoses.ts`) without marking it taken — the doc (and its `taken` array as it stood) stays as a record that it was missed, it just stops being surfaced as needing action. */
  cleared?: boolean
}

/**
 * One occurrence's taken/not-taken record for a custom-schedule dose,
 * stored separately from `DoseLogDocument` (collection
 * `users/{uid}/customDoseLogs`) since a custom occurrence isn't addressable
 * by calendar day + slot index. Doc id is
 * `${doseId}_custom_${entryId}_${occurrenceIndex}` — see
 * `lib/customSchedule.ts#occurrenceLogId`, the single source of truth for
 * that string, shared by both the write and query paths.
 */
export type CustomDoseLogDocument = {
  doseId: string
  entryId: string
  occurrenceIndex: number
  /** This occurrence's own scheduled instant (epoch ms), snapshotted at write time so history renders correctly even if the entry is later edited or removed. */
  scheduledAt: number
  taken: boolean
  /** Same meaning as `DoseLogDocument.cleared` — dismissed from the missed list without claiming it was taken. */
  cleared?: boolean
}
