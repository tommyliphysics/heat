import { Link } from 'react-router-dom'
import Icon from './Icon.tsx'
import Modal from './Modal.tsx'
import { auth } from '../firebase.ts'
import { clearMissedCustomOccurrence, setCustomOccurrenceTaken } from '../lib/customDoseLog.ts'
import { generateDoseOccurrences, occurrenceLogId } from '../lib/customSchedule.ts'
import { formatOccurrenceDateTime } from '../lib/doseStatus.ts'
import type { CustomDoseLogDocument, DoseListItem } from '../types/doses.ts'

type CustomDoseCheckModalProps = {
  open: boolean
  onClose: () => void
  dose: DoseListItem | null
  logsByOccurrenceId: Map<string, CustomDoseLogDocument>
  now: Date
}

/** Older overdue occurrences beyond this stay reachable only via the Missed Dose table on Daily Doses — keeps a long-neglected schedule from making this modal unbounded. */
const MAX_OVERDUE_SHOWN = 10

function doseCountLabel(doseCount: number): string {
  return `${doseCount} dose${doseCount === 1 ? '' : 's'}`
}

function CustomDoseCheckModal({
  open,
  onClose,
  dose,
  logsByOccurrenceId,
  now,
}: CustomDoseCheckModalProps) {
  if (!dose) return null

  const nowMs = now.getTime()
  const occurrences = generateDoseOccurrences(dose)

  function logFor(entryId: string, occurrenceIndex: number) {
    return logsByOccurrenceId.get(occurrenceLogId(dose!.id, entryId, occurrenceIndex))
  }

  const overdue = occurrences
    .filter((o) => o.at < nowMs)
    .filter((o) => {
      const log = logFor(o.entryId, o.occurrenceIndex)
      return !log?.taken && !log?.cleared
    })
    .slice(-MAX_OVERDUE_SHOWN)

  const upcoming = occurrences.find((o) => o.at > nowMs)

  async function handleToggle(
    entryId: string,
    occurrenceIndex: number,
    at: number,
    doseCount: number,
    checked: boolean,
  ) {
    const user = auth.currentUser
    if (!user || !dose) return
    await setCustomOccurrenceTaken(user.uid, dose, { entryId, occurrenceIndex, at, doseCount }, checked)
  }

  async function handleClear(entryId: string, occurrenceIndex: number, at: number) {
    const user = auth.currentUser
    if (!user || !dose) return
    await clearMissedCustomOccurrence(user.uid, dose.id, entryId, occurrenceIndex, at)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      titleId="custom-dose-check-title"
      title={dose.name}
      headerAction={
        <Link to={`/doses/${dose.id}/edit`} className="icon-btn" aria-label="Edit dose">
          <Icon name="pencil" size={14} />
        </Link>
      }
    >
      {dose.dose && <p className="dose-check-amount">{dose.dose}</p>}

      {overdue.length === 0 && !upcoming && <p>No scheduled doses.</p>}

      {overdue.map((o) => (
        <div key={`${o.entryId}-${o.occurrenceIndex}`} className="custom-dose-occurrence-row">
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={false}
              onChange={(e) =>
                handleToggle(o.entryId, o.occurrenceIndex, o.at, o.doseCount, e.target.checked)
              }
            />
            {formatOccurrenceDateTime(o.at)} ({doseCountLabel(o.doseCount)})
          </label>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => handleClear(o.entryId, o.occurrenceIndex, o.at)}
          >
            Clear
          </button>
        </div>
      ))}

      {upcoming && (
        <p className="form-hint">
          Next: {formatOccurrenceDateTime(upcoming.at)} ({doseCountLabel(upcoming.doseCount)})
        </p>
      )}

      <button type="button" className="btn btn-primary btn-full" onClick={onClose}>
        Done
      </button>
    </Modal>
  )
}

export default CustomDoseCheckModal
