/** Matches `Date.getDay()` — 0 = Sunday ... 6 = Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export const WEEKDAY_ORDER: Weekday[] = [0, 1, 2, 3, 4, 5, 6]

export const WEEKDAY_NAMES: Record<Weekday, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
}

/** Digit order for numeric date display — e.g. 27 Aug 2026 as "08/27/2026" (MDY), "27/08/2026" (DMY), or "2026-08-27" (YMD). */
export type DateFormat = 'MDY' | 'DMY' | 'YMD'

export const DATE_FORMAT_ORDER: DateFormat[] = ['MDY', 'DMY', 'YMD']

export type UserSettings = {
  /** A self-chosen, non-unique display name — the account's real identifier is always its Firebase uid, so this is purely cosmetic (see `lib/connect.ts`'s connect-code alias, which defaults to this). Absent until the user sets one, either here or by opting in when generating their connect code. */
  username?: string
  /** This account's current permanent connect code (its id in `connectCodes/{code}`) — a pointer, not the source of truth, so the Connect page knows whether one already exists without a separate query. Absent until the user generates their first one; replaced (never edited in place) on every regenerate, which is what invalidates the previous code. */
  connectCode?: string
  weekStartsOn: Weekday
  /** IANA time zone name (e.g. "America/New_York"), used to decide which calendar day a piece of inventory-consumption bookkeeping falls on. Auto-detected at signup (see `ensureDefaultSettings`); changeable here. */
  timezone: string
  /** Auto-detected from the browser's locale at signup; changeable here. */
  dateFormat: DateFormat
  /** "Daily Doses" setting — a persistent red banner (see `DoseAlertBanners.tsx`) when a dose missed yesterday hasn't been resolved yet, shown until midday. */
  showMissedDosesAlert: boolean
  /** "Daily Doses" setting — a persistent blue banner counting down to a dose due within the next hour. */
  showDoseCountdown: boolean
  /** "Daily Doses" setting — a persistent amber banner while a dose's tracked inventory (see `DoseDocument.inventoryBatchId`) is at or below its low-stock threshold. */
  showLowStockWarning: boolean
  /** Set once the account holder confirms "Delete Account" (see `lib/account.ts`'s `requestAccountDeletion`) — a flag for an out-of-band job to review and actually perform the deletion; this app is client-only and never deletes the account or its data itself. Absent means no deletion has been requested. */
  deletionRequestedAt?: number
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  weekStartsOn: 0,
  timezone: 'UTC',
  dateFormat: 'MDY',
  showMissedDosesAlert: true,
  showDoseCountdown: true,
  showLowStockWarning: true,
}
