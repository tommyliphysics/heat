import type { DoseListItem } from '../types/doses.ts'

/** The implicit deadline for a dose slot with no configured time — used by the countdown banner (see `DoseAlertBanners.tsx`) so an untimed dose still gets a heads-up before its day runs out, instead of never alerting at all. */
export const DEFAULT_DOSE_TIME = '23:59'

export type DoseStatus =
  | { kind: 'taken' }
  | { kind: 'untaken' }
  | { kind: 'upcoming'; time: string; index: number }
  | { kind: 'missed'; time: string; index: number }

export function parseTimeToday(hhmm: string, now: Date): Date {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(now)
  d.setHours(h || 0, m || 0, 0, 0)
  return d
}

/**
 * Today's status for one dose definition, given its taken/not-taken record
 * for today (padded with `false` for any missing entries):
 * - `taken` once every dose for the day is checked off.
 * - `untaken` when not all are taken and no dose times are configured — no
 *   time-based distinction to make.
 * - Otherwise, the earliest still-untaken dose (by scheduled time) decides
 *   the status: `upcoming` if its time hasn't passed yet, `missed` if it
 *   has.
 */
export function computeDoseStatus(
  dose: DoseListItem,
  taken: boolean[],
  now: Date,
): DoseStatus {
  const dosesPerDay = Math.max(1, Number(dose.dosesPerDay) || 1)
  const takenPadded = Array.from(
    { length: dosesPerDay },
    (_, i) => taken[i] ?? false,
  )
  if (takenPadded.every(Boolean)) return { kind: 'taken' }

  const times = dose.doseTimes
  if (!times || times.length === 0) return { kind: 'untaken' }

  // Only doses with an actual time set can be judged upcoming/missed — a
  // blank slot (the times section was opened but not every dose filled in)
  // falls through to the generic `untaken` status instead.
  const order = times
    .map((_, i) => i)
    .filter((i) => i < dosesPerDay && times[i])
    .sort((a, b) => times[a].localeCompare(times[b]))

  for (const i of order) {
    if (takenPadded[i]) continue
    const target = parseTimeToday(times[i], now)
    if (target.getTime() > now.getTime()) {
      return { kind: 'upcoming', time: times[i], index: i }
    }
    return { kind: 'missed', time: times[i], index: i }
  }

  return { kind: 'untaken' }
}

export type AggregateDoseStatus = 'taken' | 'pending' | 'missed' | 'none'

/** A single glance-icon status across every dose — for the Calendar's header widget. */
export function aggregateDoseStatus(
  statuses: DoseStatus[],
): AggregateDoseStatus {
  if (statuses.length === 0) return 'none'
  if (statuses.some((s) => s.kind === 'missed')) return 'missed'
  if (statuses.every((s) => s.kind === 'taken')) return 'taken'
  return 'pending'
}

/** e.g. "8:00 AM" from a stored 'HH:MM' (24h) time. */
export function formatTimeOfDay(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date()
  d.setHours(h || 0, m || 0, 0, 0)
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/** e.g. "in 2h 15m" / "in 45m" / "now", counting down to a stored 'HH:MM' time today. */
export function formatCountdown(targetTime: string, now: Date): string {
  return formatCountdownFromNow(parseTimeToday(targetTime, now).getTime(), now)
}

/** Like `formatCountdown`, but from an exact epoch-ms target instead of an 'HH:MM' string implicitly anchored to today — for custom-schedule occurrences, which may be days away. */
export function formatCountdownFromNow(atMs: number, now: Date): string {
  const totalMinutes = Math.max(0, Math.round((atMs - now.getTime()) / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0 && minutes === 0) return 'now'
  if (hours === 0) return `in ${minutes}m`
  if (minutes === 0) return `in ${hours}h`
  return `in ${hours}h ${minutes}m`
}

/** e.g. "Sep 2, 8:00 AM" for a custom-schedule occurrence's exact epoch-ms scheduled time. */
export function formatOccurrenceDateTime(atMs: number): string {
  return new Date(atMs).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
