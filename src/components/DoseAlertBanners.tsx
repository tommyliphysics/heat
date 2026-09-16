import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from './Icon.tsx'
import { useCustomDoseLogs } from '../hooks/useCustomDoseLogs.ts'
import { useDoses } from '../hooks/useDoses.ts'
import { useInventoryBatches } from '../hooks/useInventoryBatches.ts'
import { useMissedDoses } from '../hooks/useMissedDoses.ts'
import { useTodayDoseLogs } from '../hooks/useTodayDoseLogs.ts'
import { useUserSettings } from '../hooks/useUserSettings.ts'
import { computeMissedOccurrences } from '../lib/customDoseStatus.ts'
import { generateDoseOccurrences, occurrenceLogId } from '../lib/customSchedule.ts'
import {
  computeDoseStatus,
  DEFAULT_DOSE_TIME,
  formatCountdown,
  formatCountdownFromNow,
  parseTimeToday,
} from '../lib/doseStatus.ts'
import { latestRemaining } from '../lib/inventory.ts'
import { addDays, parseDateStr, toDateStr } from '../lib/timeline.ts'

/** How far ahead of a dose's scheduled time the countdown banner starts showing. */
const COUNTDOWN_WINDOW_MINUTES = 60

type TodayMissedAlert = { doseId: string; name: string }
type CountdownAlert = { key: string; name: string; time: string }
type CustomCountdownAlert = { key: string; name: string; atMs: number }
type LowStockAlert = { doseId: string; name: string; remaining: number }

/**
 * App-wide persistent banners for dose reminders (see `AppNav.tsx`), each
 * gated by its own "Daily Doses" setting:
 * - Missed (red): two cases, always shown together.
 *   1. A dose (or custom-schedule occurrence) already past its own
 *      scheduled time today and still not taken — no midday cutoff, since
 *      this is about right now, not history. This is the same "missed"
 *      status already shown in red on the Daily Doses/Dashboard row for
 *      that dose; the banner just surfaces it at the top too.
 *   2. A dose missed exactly yesterday, still unresolved, shown only
 *      before midday today — after that it's still on the Daily Doses
 *      page's missed list, just no longer banner-worthy.
 * - Countdown (blue): a dose (or occurrence) due within the next hour, not
 *   yet taken.
 * - Low stock (amber): a dose's tracked inventory (see
 *   `DoseDocument.inventoryBatchId`) is at or below its warning threshold —
 *   persists for as long as that's true, no time window. Already
 *   schedule-agnostic, so it needs no custom-schedule-specific logic.
 */
function DoseAlertBanners() {
  const { showMissedDosesAlert, showDoseCountdown, showLowStockWarning } =
    useUserSettings()
  const { doses } = useDoses()
  const recurringDoses = doses.filter((dose) => dose.scheduleType !== 'custom')
  const customDoses = doses.filter((dose) => dose.scheduleType === 'custom')
  const { batches } = useInventoryBatches()
  const todayLogs = useTodayDoseLogs()
  const { logsById: customLogsByOccurrenceId, loaded: customLogsLoaded } =
    useCustomDoseLogs(customDoses)
  // `useMissedDoses` scans every dose's day-indexed `doseLogs` history —
  // custom-schedule doses never write there, so they're excluded here to
  // avoid every day since creation being misread as missed.
  const missedDoses = useMissedDoses().filter((m) => m.dose.scheduleType !== 'custom')
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(interval)
  }, [])

  if (!showMissedDosesAlert && !showDoseCountdown && !showLowStockWarning) {
    return null
  }

  const todayStr = toDateStr(now)
  const yesterday = addDays(todayStr, -1)
  const isBeforeMidday = now.getHours() < 12

  const missedAlerts =
    showMissedDosesAlert && isBeforeMidday
      ? missedDoses.filter((m) => m.date === yesterday)
      : []

  const customMissedAlerts =
    showMissedDosesAlert && isBeforeMidday && customLogsLoaded
      ? computeMissedOccurrences(customDoses, customLogsByOccurrenceId, now).filter(
          (m) => m.at >= parseDateStr(yesterday).getTime() && m.at < parseDateStr(todayStr).getTime(),
        )
      : []

  // Today's own overdue-and-unresolved doses — distinct from `missedAlerts`
  // above (a fully-elapsed past day): no midday cutoff here, since this is
  // about right now rather than history, and it's the same "missed" status
  // already shown in red on the Daily Doses/Dashboard row.
  const todayMissedAlerts: TodayMissedAlert[] = []
  if (showMissedDosesAlert) {
    for (const dose of recurringDoses) {
      const status = computeDoseStatus(dose, todayLogs[dose.id] ?? [], now)
      if (status.kind === 'missed') {
        todayMissedAlerts.push({ doseId: dose.id, name: dose.name })
      }
    }
  }

  const customTodayMissedAlerts =
    showMissedDosesAlert && customLogsLoaded
      ? computeMissedOccurrences(customDoses, customLogsByOccurrenceId, now).filter(
          (m) => m.at >= parseDateStr(todayStr).getTime(),
        )
      : []

  const countdownAlerts: CountdownAlert[] = []
  if (showDoseCountdown) {
    for (const dose of recurringDoses) {
      const dosesPerDay = Math.max(1, Number(dose.dosesPerDay) || 1)
      const taken = todayLogs[dose.id] ?? []
      const times = dose.doseTimes

      for (let i = 0; i < dosesPerDay; i++) {
        if (taken[i]) continue
        // A slot with no configured time still gets a heads-up before the
        // day runs out, rather than never alerting at all.
        const effectiveTime = times?.[i] || DEFAULT_DOSE_TIME
        const target = parseTimeToday(effectiveTime, now)
        const minutesUntil = (target.getTime() - now.getTime()) / 60000
        if (minutesUntil > 0 && minutesUntil <= COUNTDOWN_WINDOW_MINUTES) {
          countdownAlerts.push({ key: `${dose.id}-${i}`, name: dose.name, time: effectiveTime })
        }
      }
    }
  }

  const customCountdownAlerts: CustomCountdownAlert[] = []
  if (showDoseCountdown && customLogsLoaded) {
    const nowMs = now.getTime()
    for (const dose of customDoses) {
      for (const occurrence of generateDoseOccurrences(dose)) {
        const minutesUntil = (occurrence.at - nowMs) / 60000
        if (minutesUntil <= 0 || minutesUntil > COUNTDOWN_WINDOW_MINUTES) continue
        const log = customLogsByOccurrenceId.get(
          occurrenceLogId(dose.id, occurrence.entryId, occurrence.occurrenceIndex),
        )
        if (log?.taken) continue
        customCountdownAlerts.push({
          key: `${dose.id}-${occurrence.entryId}-${occurrence.occurrenceIndex}`,
          name: dose.name,
          atMs: occurrence.at,
        })
      }
    }
  }

  const lowStockAlerts: LowStockAlert[] = []
  if (showLowStockWarning) {
    for (const dose of doses) {
      if (!dose.inventoryBatchId || !dose.lowStockThreshold) continue
      const batch = batches.find((b) => b.id === dose.inventoryBatchId)
      if (!batch) continue
      const remaining = Number(latestRemaining(batch))
      if (remaining <= Number(dose.lowStockThreshold)) {
        lowStockAlerts.push({ doseId: dose.id, name: dose.name, remaining })
      }
    }
  }

  if (
    missedAlerts.length === 0 &&
    customMissedAlerts.length === 0 &&
    todayMissedAlerts.length === 0 &&
    customTodayMissedAlerts.length === 0 &&
    countdownAlerts.length === 0 &&
    customCountdownAlerts.length === 0 &&
    lowStockAlerts.length === 0
  ) {
    return null
  }

  return (
    <div className="dose-alert-banners">
      {missedAlerts.map((m) => (
        <Link
          to="/doses"
          key={`missed-${m.doseId}-${m.date}`}
          className="dose-alert-banner dose-alert-banner--missed"
        >
          <Icon name="warning" size={16} />
          Missed dose: {m.doseName}
        </Link>
      ))}
      {customMissedAlerts.map((m) => (
        <Link
          to="/doses"
          key={`missed-custom-${m.doseId}-${m.entryId}-${m.occurrenceIndex}`}
          className="dose-alert-banner dose-alert-banner--missed"
        >
          <Icon name="warning" size={16} />
          Missed dose: {m.doseName}
        </Link>
      ))}
      {todayMissedAlerts.map((m) => (
        <Link
          to="/doses"
          key={`missed-today-${m.doseId}`}
          className="dose-alert-banner dose-alert-banner--missed"
        >
          <Icon name="warning" size={16} />
          Missed dose: {m.name}
        </Link>
      ))}
      {customTodayMissedAlerts.map((m) => (
        <Link
          to="/doses"
          key={`missed-today-custom-${m.doseId}-${m.entryId}-${m.occurrenceIndex}`}
          className="dose-alert-banner dose-alert-banner--missed"
        >
          <Icon name="warning" size={16} />
          Missed dose: {m.doseName}
        </Link>
      ))}
      {countdownAlerts.map((c) => (
        <Link
          to="/doses"
          key={`countdown-${c.key}`}
          className="dose-alert-banner dose-alert-banner--countdown"
        >
          <Icon name="pill" size={16} />
          {c.name} due {formatCountdown(c.time, now)}
        </Link>
      ))}
      {customCountdownAlerts.map((c) => (
        <Link
          to="/doses"
          key={`countdown-custom-${c.key}`}
          className="dose-alert-banner dose-alert-banner--countdown"
        >
          <Icon name="pill" size={16} />
          {c.name} due {formatCountdownFromNow(c.atMs, now)}
        </Link>
      ))}
      {lowStockAlerts.map((l) => (
        <Link
          to="/doses"
          key={`low-stock-${l.doseId}`}
          className="dose-alert-banner dose-alert-banner--low-stock"
        >
          <Icon name="warning" size={16} />
          {l.name} running low ({l.remaining} left)
        </Link>
      ))}
    </div>
  )
}

export default DoseAlertBanners
