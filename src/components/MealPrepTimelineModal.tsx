import { useEffect, useState } from 'react'
import Modal from './Modal.tsx'
import { auth } from '../firebase.ts'
import {
  applyMealPreparedDeduction,
  inventoryChangesOnDate,
} from '../lib/mealPreparation.ts'
import { formatUnitLabel } from '../lib/units.ts'
import type { InventoryBatchItem, MealListItem } from '../types/food.ts'

type MealPrepTimelineModalProps = {
  open: boolean
  onClose: () => void
  meal: MealListItem | null
  batches: InventoryBatchItem[]
}

/** "HH:MM" for right now, the sensible default when marking a meal just finished cooking. */
function nowTimeValue(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatEventTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function MealPrepTimelineModal({
  open,
  onClose,
  meal,
  batches,
}: MealPrepTimelineModalProps) {
  const [time, setTime] = useState(nowTimeValue)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setTime(nowTimeValue())
      setError('')
    }
  }, [open])

  if (!meal) return null

  const events = inventoryChangesOnDate(batches, meal.date)
  const alreadyPrepared = meal.preparedDeductionAt != null

  async function handleConfirm() {
    const user = auth.currentUser
    if (!user || !meal) return

    setError('')
    setSaving(true)
    try {
      const preparedAt = new Date(`${meal.date}T${time}:00`).getTime()
      const result = await applyMealPreparedDeduction(
        user.uid,
        meal,
        batches,
        preparedAt,
      )
      if (result.ok) {
        onClose()
      } else {
        setError(result.reason)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      titleId="meal-prep-title"
      title="Mark as Prepared"
    >
      {alreadyPrepared ? (
        <p>
          Already marked prepared at{' '}
          {formatEventTime(meal.preparedDeductionAt as number)}.
        </p>
      ) : (
        <>
          <p>
            Inventory changes on this day — pick a time after the last one to
            deduct this meal's ingredients now.
          </p>

          {events.length === 0 ? (
            <p className="meal-prep-timeline-empty">
              No inventory changes recorded yet on this day.
            </p>
          ) : (
            <ul className="meal-prep-timeline">
              {events.map((event, i) => (
                <li key={i} className="meal-prep-timeline-row">
                  <span className="meal-prep-timeline-time">
                    {formatEventTime(event.timestamp)}
                  </span>
                  <span>{event.foodName}</span>
                  <span className="cell-mono">
                    {event.fromAmount}
                    {formatUnitLabel(event.unit)} &rarr; {event.toAmount}
                    {formatUnitLabel(event.unit)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <label htmlFor="meal-prep-time">Prepared at</label>
          <input
            id="meal-prep-time"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />

          {error && <p className="form-error">{error}</p>}

          <button
            type="button"
            className="btn btn-primary btn-full"
            onClick={handleConfirm}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Confirm'}
          </button>
        </>
      )}
    </Modal>
  )
}

export default MealPrepTimelineModal
