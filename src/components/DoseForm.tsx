import { useEffect, useId, useState } from 'react'
import ConfirmDeleteModal from './ConfirmDeleteModal.tsx'
import Icon from './Icon.tsx'
import MicronutrientListField from './MicronutrientListField.tsx'
import PageLayout from './PageLayout.tsx'
import { EMPTY_DOSE_FORM_VALUES, type DoseFormValues } from '../lib/doses.ts'
import type { Micronutrient, MicronutrientUnit } from '../types/food.ts'
import type { CustomScheduleEntry, DoseRepeatRule, RepeatUnit, ScheduleType } from '../types/doses.ts'
import '../pages/pages.css'

type DoseFormProps = {
  title: string
  submitLabel: string
  savingLabel: string
  initialValues?: DoseFormValues
  onSubmit: (values: DoseFormValues) => Promise<void>
  onDelete?: () => Promise<void>
  resetOnSuccess?: boolean
}

const REPEAT_UNITS: RepeatUnit[] = ['minutes', 'hours', 'days']

function emptyScheduleEntry(): CustomScheduleEntry {
  return { id: crypto.randomUUID(), date: '', time: '', doseCount: '1' }
}

function DoseForm({
  title,
  submitLabel,
  savingLabel,
  initialValues,
  onSubmit,
  onDelete,
  resetOnSuccess = true,
}: DoseFormProps) {
  // Add Dose and Edit Dose both use this component and are both
  // permanently mounted at once (see PageRegistry.tsx), so a plain static
  // id like "dose-name" would collide between this form's own two
  // simultaneously-mounted instances — useId() gives each instance a
  // unique prefix instead.
  const formId = useId()
  const start = initialValues ?? EMPTY_DOSE_FORM_VALUES
  const [deleteOpen, setDeleteOpen] = useState(false)

  const [name, setName] = useState(start.name)
  const [dose, setDose] = useState(start.dose)
  const [scheduleType, setScheduleType] = useState<ScheduleType>(start.scheduleType)
  const [dosesPerDay, setDosesPerDay] = useState(start.dosesPerDay)
  const [doseTimes, setDoseTimes] = useState<string[]>(start.doseTimes)
  const [timesOpen, setTimesOpen] = useState(start.doseTimes.some((t) => t))
  const [customSchedule, setCustomSchedule] = useState<CustomScheduleEntry[]>(
    start.customSchedule,
  )
  const [micronutrients, setMicronutrients] = useState<Micronutrient[]>(
    start.micronutrients,
  )
  const [currentStock, setCurrentStock] = useState(start.currentStock)
  const [lowStockThreshold, setLowStockThreshold] = useState(
    start.lowStockThreshold,
  )

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const count = Math.max(1, Number(dosesPerDay) || 1)

  // Keep `doseTimes` the same length as the current doses/day count, so
  // each dose always has a (possibly blank) slot to set a time for.
  useEffect(() => {
    setDoseTimes((current) => {
      if (current.length === count) return current
      const next = current.slice(0, count)
      while (next.length < count) next.push('')
      return next
    })
  }, [count])

  function updateDoseTime(index: number, value: string) {
    setDoseTimes((current) =>
      current.map((t, i) => (i === index ? value : t)),
    )
  }

  function addScheduleEntry() {
    setCustomSchedule((entries) => [...entries, emptyScheduleEntry()])
  }

  function removeScheduleEntry(id: string) {
    setCustomSchedule((entries) => entries.filter((e) => e.id !== id))
  }

  function updateScheduleEntry(
    id: string,
    field: 'date' | 'time' | 'doseCount',
    value: string,
  ) {
    setCustomSchedule((entries) =>
      entries.map((e) => (e.id === id ? { ...e, [field]: value } : e)),
    )
  }

  function toggleRepeat(id: string, enabled: boolean) {
    setCustomSchedule((entries) =>
      entries.map((e) =>
        e.id === id
          ? {
              ...e,
              repeat: enabled
                ? { everyValue: '1', everyUnit: 'hours', forValue: '1', forUnit: 'days' }
                : undefined,
            }
          : e,
      ),
    )
  }

  function updateRepeat(
    id: string,
    field: keyof DoseRepeatRule,
    value: string,
  ) {
    setCustomSchedule((entries) =>
      entries.map((e) =>
        e.id === id && e.repeat ? { ...e, repeat: { ...e.repeat, [field]: value } } : e,
      ),
    )
  }

  function addMicronutrient() {
    setMicronutrients((rows) => [
      ...rows,
      { id: crypto.randomUUID(), name: '', amount: '', unit: 'mg' },
    ])
  }

  function updateMicronutrient(
    id: string,
    field: 'name' | 'amount',
    value: string,
  ) {
    setMicronutrients((rows) =>
      rows.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    )
  }

  function updateMicronutrientUnit(id: string, unit: MicronutrientUnit) {
    setMicronutrients((rows) =>
      rows.map((row) => (row.id === id ? { ...row, unit } : row)),
    )
  }

  function removeMicronutrient(id: string) {
    setMicronutrients((rows) => rows.filter((row) => row.id !== id))
  }

  function validateCustomSchedule(): string | null {
    if (customSchedule.length === 0) {
      return 'Add at least one schedule entry.'
    }
    for (const entry of customSchedule) {
      if (!entry.date || !entry.time) {
        return 'Each schedule entry needs a date and time.'
      }
      if (!entry.doseCount.trim() || Number(entry.doseCount) < 1) {
        return 'Each schedule entry needs a dose count of at least 1.'
      }
      if (entry.repeat) {
        if (!entry.repeat.everyValue.trim() || Number(entry.repeat.everyValue) <= 0) {
          return 'A repeat rule’s "every" amount must be greater than 0.'
        }
        if (!entry.repeat.forValue.trim() || Number(entry.repeat.forValue) <= 0) {
          return 'A repeat rule’s "for" duration must be greater than 0.'
        }
      }
    }
    // Unedited entries whose id came from an already-saved schedule are
    // fine — buildDoseDocument mints a fresh id itself for any that changed.
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (scheduleType === 'custom') {
      const validationError = validateCustomSchedule()
      if (validationError) {
        setError(validationError)
        return
      }
    }

    setSaving(true)
    try {
      await onSubmit({
        name,
        dose,
        scheduleType,
        dosesPerDay,
        doseTimes,
        customSchedule,
        micronutrients,
        currentStock,
        lowStockThreshold,
      })

      if (resetOnSuccess) {
        setName('')
        setDose('')
        setScheduleType('recurring')
        setDosesPerDay('1')
        setDoseTimes([])
        setTimesOpen(false)
        setCustomSchedule([])
        setMicronutrients([])
        setCurrentStock('')
        setLowStockThreshold('')
      }
    } catch {
      setError('Could not save this dose. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageLayout
        header={
          <div className="title-row">
            <h1>{title}</h1>
            {onDelete && (
              <button
                type="button"
                className="icon-btn icon-btn-danger"
                onClick={() => setDeleteOpen(true)}
                aria-label="Delete dose"
              >
                <Icon name="trash" size={16} />
              </button>
            )}
          </div>
        }
      >
        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor={`${formId}-dose-name`}>Name</label>
          <input
            id={`${formId}-dose-name`}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <label htmlFor={`${formId}-dose-amount`}>Dose</label>
          <input
            id={`${formId}-dose-amount`}
            type="text"
            placeholder="e.g. 500mg or 1 tablet"
            value={dose}
            onChange={(e) => setDose(e.target.value)}
          />

          <div className="toggle-group">
            <button
              type="button"
              className={`toggle-option${scheduleType === 'recurring' ? ' active' : ''}`}
              onClick={() => setScheduleType('recurring')}
            >
              Recurring daily
            </button>
            <button
              type="button"
              className={`toggle-option${scheduleType === 'custom' ? ' active' : ''}`}
              onClick={() => setScheduleType('custom')}
            >
              Custom schedule
            </button>
          </div>

          {scheduleType === 'recurring' ? (
            <>
              <label htmlFor={`${formId}-doses-per-day`}>Doses per day</label>
              <input
                id={`${formId}-doses-per-day`}
                type="number"
                min="1"
                value={dosesPerDay}
                onChange={(e) => setDosesPerDay(e.target.value)}
              />

              <button
                type="button"
                className="btn btn-secondary btn-full"
                onClick={() => setTimesOpen((v) => !v)}
                aria-expanded={timesOpen}
              >
                Set dosage times
                <Icon
                  name="chevron-down"
                  size={14}
                  className={timesOpen ? undefined : 'icon-collapsed'}
                />
              </button>

              {timesOpen && (
                <div className="dose-times-fields">
                  {Array.from({ length: count }).map((_, i) => (
                    <div key={i} className="dose-time-row">
                      <label htmlFor={`${formId}-dose-time-${i}`}>Dose {i + 1} time</label>
                      <input
                        id={`${formId}-dose-time-${i}`}
                        type="time"
                        value={doseTimes[i] ?? ''}
                        onChange={(e) => updateDoseTime(i, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="custom-schedule-fields">
              {customSchedule.map((entry, i) => (
                <div key={entry.id} className="custom-schedule-entry">
                  <div className="custom-schedule-entry-row">
                    <label htmlFor={`schedule-date-${entry.id}`}>Date</label>
                    <input
                      id={`schedule-date-${entry.id}`}
                      type="date"
                      value={entry.date}
                      onChange={(e) => updateScheduleEntry(entry.id, 'date', e.target.value)}
                    />
                    <label htmlFor={`schedule-time-${entry.id}`}>Time</label>
                    <input
                      id={`schedule-time-${entry.id}`}
                      type="time"
                      value={entry.time}
                      onChange={(e) => updateScheduleEntry(entry.id, 'time', e.target.value)}
                    />
                  </div>

                  <div className="custom-schedule-entry-row">
                    <label htmlFor={`schedule-count-${entry.id}`}>Doses</label>
                    <input
                      id={`schedule-count-${entry.id}`}
                      type="number"
                      min="1"
                      value={entry.doseCount}
                      onChange={(e) => updateScheduleEntry(entry.id, 'doseCount', e.target.value)}
                    />
                    <button
                      type="button"
                      className="icon-btn icon-btn-danger"
                      aria-label={`Remove schedule entry ${i + 1}`}
                      onClick={() => removeScheduleEntry(entry.id)}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </div>

                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={!!entry.repeat}
                      onChange={(e) => toggleRepeat(entry.id, e.target.checked)}
                    />
                    Repeat
                  </label>

                  {entry.repeat && (
                    <div className="custom-schedule-repeat-row">
                      <span>Every</span>
                      <input
                        type="number"
                        min="1"
                        aria-label="Repeat every"
                        value={entry.repeat.everyValue}
                        onChange={(e) => updateRepeat(entry.id, 'everyValue', e.target.value)}
                      />
                      <select
                        aria-label="Repeat every unit"
                        value={entry.repeat.everyUnit}
                        onChange={(e) => updateRepeat(entry.id, 'everyUnit', e.target.value)}
                      >
                        {REPEAT_UNITS.map((unit) => (
                          <option key={unit} value={unit}>
                            {unit}
                          </option>
                        ))}
                      </select>
                      <span>for</span>
                      <input
                        type="number"
                        min="1"
                        aria-label="Repeat for"
                        value={entry.repeat.forValue}
                        onChange={(e) => updateRepeat(entry.id, 'forValue', e.target.value)}
                      />
                      <select
                        aria-label="Repeat for unit"
                        value={entry.repeat.forUnit}
                        onChange={(e) => updateRepeat(entry.id, 'forUnit', e.target.value)}
                      >
                        {REPEAT_UNITS.map((unit) => (
                          <option key={unit} value={unit}>
                            {unit}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              ))}

              <button
                type="button"
                className="btn btn-secondary btn-full"
                onClick={addScheduleEntry}
              >
                <Icon name="plus" size={14} />
                Add Schedule Entry
              </button>
            </div>
          )}

          <h2 className="form-section-heading">Inventory Tracking</h2>
          <p className="form-hint">
            Enter how many you currently have to start tracking stock in
            Inventory — taking a dose will deduct one automatically.
          </p>

          <label htmlFor={`${formId}-dose-current-stock`}>Current stock</label>
          <input
            id={`${formId}-dose-current-stock`}
            type="number"
            min="0"
            placeholder="e.g. 30"
            value={currentStock}
            onChange={(e) => setCurrentStock(e.target.value)}
          />

          <label htmlFor={`${formId}-dose-low-stock-threshold`}>
            Warn when remaining reaches
          </label>
          <input
            id={`${formId}-dose-low-stock-threshold`}
            type="number"
            min="0"
            placeholder="e.g. 5"
            value={lowStockThreshold}
            onChange={(e) => setLowStockThreshold(e.target.value)}
          />

          <h2 className="form-section-heading">Micronutrients</h2>
          <MicronutrientListField
            micronutrients={micronutrients}
            onAdd={addMicronutrient}
            onChange={updateMicronutrient}
            onUnitChange={updateMicronutrientUnit}
            onRemove={removeMicronutrient}
          />

          {error && <p className="form-error">{error}</p>}

          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? savingLabel : submitLabel}
          </button>
        </form>
      </PageLayout>

      {onDelete && (
        <ConfirmDeleteModal
          open={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          onConfirm={onDelete}
          title="Delete Dose?"
          message={`This will permanently delete "${name || 'this dose'}". This can't be undone.`}
        />
      )}
    </>
  )
}

export default DoseForm
