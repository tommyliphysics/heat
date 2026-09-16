import { useEffect, useState } from 'react'
import { auth } from '../firebase.ts'
import PageLayout from '../components/PageLayout.tsx'
import { formatShortDate } from '../lib/timeline.ts'
import { setUsername as saveUsername } from '../lib/profile.ts'
import { subscribeToUserSettings, updateUserSettings } from '../lib/settings.ts'
import {
  DATE_FORMAT_ORDER,
  DEFAULT_USER_SETTINGS,
  WEEKDAY_NAMES,
  WEEKDAY_ORDER,
  type DateFormat,
  type UserSettings,
  type Weekday,
} from '../types/settings.ts'
import './pages.css'

/** IANA time zone names — falls back to a short, common list on a runtime without `Intl.supportedValuesOf` (older Safari). */
function timeZoneOptions(): string[] {
  if (typeof Intl.supportedValuesOf === 'function') {
    return Intl.supportedValuesOf('timeZone')
  }
  return [
    'UTC',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Asia/Tokyo',
    'Asia/Shanghai',
    'Asia/Kolkata',
    'Australia/Sydney',
  ]
}

const TIME_ZONES = timeZoneOptions()

/** e.g. "27 Aug 2026" rendered as each format would show it, so the option itself doubles as an example. */
const SAMPLE_DATE = '2026-08-27'

function SettingsPage() {
  const [username, setUsername] = useState('')
  // The last value confirmed from Firestore — lets the Save button disable
  // itself once `username` matches it again, rather than stay permanently
  // enabled or need its own separate "dirty" flag.
  const [savedUsername, setSavedUsername] = useState('')
  const [savingUsername, setSavingUsername] = useState(false)
  const [weekStartsOn, setWeekStartsOn] = useState<Weekday>(
    DEFAULT_USER_SETTINGS.weekStartsOn,
  )
  const [timezone, setTimezone] = useState(DEFAULT_USER_SETTINGS.timezone)
  const [dateFormat, setDateFormat] = useState<DateFormat>(
    DEFAULT_USER_SETTINGS.dateFormat,
  )
  const [showMissedDosesAlert, setShowMissedDosesAlert] = useState(
    DEFAULT_USER_SETTINGS.showMissedDosesAlert,
  )
  const [showDoseCountdown, setShowDoseCountdown] = useState(
    DEFAULT_USER_SETTINGS.showDoseCountdown,
  )
  const [showLowStockWarning, setShowLowStockWarning] = useState(
    DEFAULT_USER_SETTINGS.showLowStockWarning,
  )
  const [error, setError] = useState('')

  useEffect(() => {
    const user = auth.currentUser
    if (!user) return

    return subscribeToUserSettings(user.uid, (settings) => {
      setUsername(settings.username ?? '')
      setSavedUsername(settings.username ?? '')
      setWeekStartsOn(settings.weekStartsOn)
      setTimezone(settings.timezone)
      setDateFormat(settings.dateFormat)
      setShowMissedDosesAlert(settings.showMissedDosesAlert)
      setShowDoseCountdown(settings.showDoseCountdown)
      setShowLowStockWarning(settings.showLowStockWarning)
    })
  }, [])

  async function handleSaveUsername() {
    const user = auth.currentUser
    if (!user) return

    setError('')
    setSavingUsername(true)
    try {
      await saveUsername(user.uid, username)
      setSavedUsername(username.trim())
    } catch {
      setError('Could not save your username. Please try again.')
    } finally {
      setSavingUsername(false)
    }
  }

  async function saveSetting(
    updates: Partial<UserSettings>,
    revert: () => void,
  ) {
    setError('')
    const user = auth.currentUser
    if (!user) return

    try {
      await updateUserSettings(user.uid, updates)
    } catch {
      revert()
      setError('Could not save this setting. Please try again.')
    }
  }

  function handleWeekStartChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = Number(e.target.value) as Weekday
    const previous = weekStartsOn
    setWeekStartsOn(value)
    saveSetting({ weekStartsOn: value }, () => setWeekStartsOn(previous))
  }

  function handleTimezoneChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value
    const previous = timezone
    setTimezone(value)
    saveSetting({ timezone: value }, () => setTimezone(previous))
  }

  function handleDateFormatChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value as DateFormat
    const previous = dateFormat
    setDateFormat(value)
    saveSetting({ dateFormat: value }, () => setDateFormat(previous))
  }

  function handleShowMissedDosesAlertChange(
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const value = e.target.checked
    const previous = showMissedDosesAlert
    setShowMissedDosesAlert(value)
    saveSetting({ showMissedDosesAlert: value }, () =>
      setShowMissedDosesAlert(previous),
    )
  }

  function handleShowDoseCountdownChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.checked
    const previous = showDoseCountdown
    setShowDoseCountdown(value)
    saveSetting({ showDoseCountdown: value }, () => setShowDoseCountdown(previous))
  }

  function handleShowLowStockWarningChange(
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const value = e.target.checked
    const previous = showLowStockWarning
    setShowLowStockWarning(value)
    saveSetting({ showLowStockWarning: value }, () =>
      setShowLowStockWarning(previous),
    )
  }

  return (
    <PageLayout header={<h1>Settings</h1>}>
      <div className="auth-form">
        <label htmlFor="username">Username</label>
        <div className="unit-row">
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. Alex"
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleSaveUsername}
            disabled={savingUsername || username.trim() === savedUsername}
          >
            {savingUsername ? 'Saving...' : 'Save'}
          </button>
        </div>
        <p className="form-hint">
          Shown to your connections and to anyone using your connect code
          instead of your account id — not unique, just a display name.
          Changing it lets your existing connections know.
        </p>

        <label htmlFor="week-start">Weekly Cycle Begins</label>
        <select
          id="week-start"
          value={weekStartsOn}
          onChange={handleWeekStartChange}
        >
          {WEEKDAY_ORDER.map((day) => (
            <option key={day} value={day}>
              {WEEKDAY_NAMES[day]}
            </option>
          ))}
        </select>

        <label htmlFor="timezone">Time Zone</label>
        <select id="timezone" value={timezone} onChange={handleTimezoneChange}>
          {!TIME_ZONES.includes(timezone) && (
            <option value={timezone}>{timezone}</option>
          )}
          {TIME_ZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>

        <label htmlFor="date-format">Date Format</label>
        <select
          id="date-format"
          value={dateFormat}
          onChange={handleDateFormatChange}
        >
          {DATE_FORMAT_ORDER.map((format) => (
            <option key={format} value={format}>
              {formatShortDate(SAMPLE_DATE, format)}
            </option>
          ))}
        </select>

        {error && <p className="form-error">{error}</p>}

        <h2 className="form-section-heading">Daily Doses</h2>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={showMissedDosesAlert}
            onChange={handleShowMissedDosesAlertChange}
          />
          Show missed doses alert
        </label>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={showDoseCountdown}
            onChange={handleShowDoseCountdownChange}
          />
          Show countdown
        </label>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={showLowStockWarning}
            onChange={handleShowLowStockWarningChange}
          />
          Show low stock warning
        </label>
      </div>
    </PageLayout>
  )
}

export default SettingsPage
