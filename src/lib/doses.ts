import type { Micronutrient } from '../types/food.ts'
import type {
  CustomScheduleEntry,
  DoseDocument,
  DoseRepeatRule,
  ScheduleType,
} from '../types/doses.ts'

export type DoseFormValues = {
  name: string
  dose: string
  scheduleType: ScheduleType
  dosesPerDay: string
  doseTimes: string[]
  /** Only used when `scheduleType === 'custom'`; see `DoseForm.tsx`'s schedule-entry-list editor. */
  customSchedule: CustomScheduleEntry[]
  micronutrients: Micronutrient[]
  /**
   * How many of this dose are currently on hand. Not itself a stored
   * `DoseDocument` field — entering a value here is what creates (or, on a
   * dose that's already tracked, corrects) the linked "Other" inventory
   * batch `inventoryBatchId` points at; see `AddDosePage`/`EditDosePage`.
   * Pre-filled from that batch's current remaining count when editing an
   * already-tracked dose; blank means "don't start tracking" (on a new
   * dose) or "leave the current count as-is" (on one already tracked).
   */
  currentStock: string
  /** Warn once the linked inventory batch's remaining count drops to or below this. Only meaningful once `currentStock` (or an earlier save) has established tracking. */
  lowStockThreshold: string
}

export const EMPTY_DOSE_FORM_VALUES: DoseFormValues = {
  name: '',
  dose: '',
  scheduleType: 'recurring',
  dosesPerDay: '1',
  doseTimes: [],
  customSchedule: [],
  micronutrients: [],
  currentStock: '',
  lowStockThreshold: '',
}

function repeatEquals(a?: DoseRepeatRule, b?: DoseRepeatRule): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  return (
    a.everyValue === b.everyValue &&
    a.everyUnit === b.everyUnit &&
    a.forValue === b.forValue &&
    a.forUnit === b.forUnit
  )
}

/** Whether `entry`'s timing differs from the same-id entry as it was last saved — the trigger for minting a fresh id (see `CustomScheduleEntry`'s doc comment on why: preserving already-logged history under its original schedule instead of silently relabeling it). A brand new entry (no `previous`) never counts as "changed" — it doesn't have any history to protect. */
function entryTimingChanged(entry: CustomScheduleEntry, previous: CustomScheduleEntry | undefined): boolean {
  if (!previous) return false
  return (
    entry.date !== previous.date ||
    entry.time !== previous.time ||
    entry.doseCount !== previous.doseCount ||
    !repeatEquals(entry.repeat, previous.repeat)
  )
}

/**
 * `previousCustomSchedule` should be the schedule as it was loaded before
 * this edit (omitted when adding a brand new dose) — used only to detect
 * which entries had their timing changed, so those (and only those) get a
 * freshly-minted id.
 */
export function buildDoseDocument(
  values: DoseFormValues,
  previousCustomSchedule?: CustomScheduleEntry[],
): DoseDocument {
  const micronutrients = Object.fromEntries(
    values.micronutrients
      .filter((m) => m.name.trim())
      .map((m) => [m.name.trim(), { amount: m.amount, unit: m.unit }]),
  )

  const base = {
    name: values.name,
    dose: values.dose,
    ...(Object.keys(micronutrients).length ? { micronutrients } : {}),
    ...(values.lowStockThreshold.trim()
      ? { lowStockThreshold: values.lowStockThreshold }
      : {}),
  }

  if (values.scheduleType === 'custom') {
    const previousById = new Map((previousCustomSchedule ?? []).map((e) => [e.id, e]))
    const customSchedule = values.customSchedule
      .filter((entry) => entry.date && entry.time && entry.doseCount.trim())
      .map((entry) =>
        entryTimingChanged(entry, previousById.get(entry.id))
          ? { ...entry, id: crypto.randomUUID() }
          : entry,
      )

    return {
      ...base,
      scheduleType: 'custom',
      customSchedule,
    }
  }

  const dosesPerDay = Math.max(1, Number(values.dosesPerDay) || 1)
  const times = values.doseTimes.slice(0, dosesPerDay)
  const hasAnyTime = times.some((t) => t.trim() !== '')

  return {
    ...base,
    dosesPerDay: values.dosesPerDay,
    ...(hasAnyTime ? { doseTimes: times } : {}),
  }
}

/** `currentStock` comes from the linked inventory batch's live remaining count (see `EditDosePage`), not from `record` itself — pass `''` when the dose isn't tracked (no `inventoryBatchId`). */
export function doseDocumentToFormValues(
  record: DoseDocument,
  currentStock: string = '',
): DoseFormValues {
  return {
    name: record.name,
    dose: record.dose,
    scheduleType: record.scheduleType ?? 'recurring',
    dosesPerDay: record.dosesPerDay ?? '1',
    doseTimes: record.doseTimes ?? [],
    customSchedule: record.customSchedule ?? [],
    micronutrients: Object.entries(record.micronutrients ?? {}).map(
      ([name, v]) => ({
        id: crypto.randomUUID(),
        name,
        amount: v.amount,
        unit: v.unit,
      }),
    ),
    currentStock,
    lowStockThreshold: record.lowStockThreshold ?? '',
  }
}
