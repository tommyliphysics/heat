import type { DateFormat } from '../types/settings.ts'
import type { MealTime } from '../types/food.ts'

/** Ordering for meals sharing a date — breakfast before lunch before dinner, etc. */
export const MEAL_TIME_ORDER: Record<MealTime, number> = {
  breakfast: 0,
  lunch: 1,
  dinner: 2,
  snack: 3,
  drink: 4,
  '': 5,
}

export function toDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function parseDateStr(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00`)
}

export function addDays(dateStr: string, days: number): string {
  const date = parseDateStr(dateStr)
  date.setDate(date.getDate() + days)
  return toDateStr(date)
}

export function buildDateRange(startStr: string, endStr: string): string[] {
  const dates: string[] = []
  const cursor = parseDateStr(startStr)
  const end = parseDateStr(endStr)
  while (cursor <= end) {
    dates.push(toDateStr(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}

export function weekRange(dateStr: string): [string, string] {
  const end = parseDateStr(dateStr)
  end.setDate(end.getDate() + 6)
  return [dateStr, toDateStr(end)]
}

export function monthRange(dateStr: string): [string, string] {
  const date = parseDateStr(dateStr)
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0)
  return [dateStr, toDateStr(end)]
}

export function yearRange(dateStr: string): [string, string] {
  const date = parseDateStr(dateStr)
  const end = new Date(date.getFullYear(), 11, 31)
  return [dateStr, toDateStr(end)]
}

export function formatDayHeading(dateStr: string): string {
  return parseDateStr(dateStr).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

/**
 * Guesses a sensible default `DateFormat` from the browser's own locale —
 * checked once at signup (see `ensureDefaultSettings`), then overridable in
 * Settings from then on. Works by asking the locale how it orders a
 * day/month/year date and reading which field comes first.
 */
export function detectDateFormat(): DateFormat {
  const parts = new Intl.DateTimeFormat().formatToParts(new Date(2000, 0, 2))
  const order = parts
    .map((part) => part.type)
    .filter((type): type is 'year' | 'month' | 'day' =>
      type === 'year' || type === 'month' || type === 'day',
    )

  if (order[0] === 'year') return 'YMD'
  if (order[0] === 'day') return 'DMY'
  return 'MDY'
}

/**
 * A fully numeric date in the given `DateFormat`'s digit order — the one
 * date rendering in the app that's genuinely ambiguous without a stated
 * order (unlike the spelled-out-month headings above), so it's the one
 * driven by the user's `dateFormat` setting rather than the browser locale.
 * `includeYear: false` drops the year, e.g. for a week-range label.
 */
export function formatShortDate(
  dateStr: string,
  format: DateFormat,
  { includeYear = true }: { includeYear?: boolean } = {},
): string {
  const date = parseDateStr(dateStr)
  const d = String(date.getDate()).padStart(2, '0')
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const y = date.getFullYear()

  if (format === 'YMD') return includeYear ? `${y}-${m}-${d}` : `${m}-${d}`
  const [first, second] = format === 'MDY' ? [m, d] : [d, m]
  return includeYear ? `${first}/${second}/${y}` : `${first}/${second}`
}

/** `formatShortDate` for a raw `Date.now()`-style timestamp (e.g. `FoodDocument.createdAt`) instead of a 'YYYY-MM-DD' string. */
export function formatShortDateFromTimestamp(
  timestamp: number,
  format: DateFormat,
): string {
  const iso = new Date(timestamp).toISOString().slice(0, 10)
  return formatShortDate(iso, format)
}

export function formatMonthYear(dateStr: string): string {
  return parseDateStr(dateStr).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })
}

export function formatYear(dateStr: string): string {
  return String(parseDateStr(dateStr).getFullYear())
}

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
