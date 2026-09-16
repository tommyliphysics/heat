import { Link } from 'react-router-dom'
import Icon from './Icon.tsx'
import Modal from './Modal.tsx'
import { auth } from '../firebase.ts'
import { setDoseTaken } from '../lib/doseLog.ts'
import { formatTimeOfDay } from '../lib/doseStatus.ts'
import type { DoseListItem } from '../types/doses.ts'

type DoseCheckModalProps = {
  open: boolean
  onClose: () => void
  dose: DoseListItem | null
  /** Today's taken/not-taken record for this dose. */
  taken: boolean[]
}

function DoseCheckModal({ open, onClose, dose, taken }: DoseCheckModalProps) {
  if (!dose) return null

  const dosesPerDay = Math.max(1, Number(dose.dosesPerDay) || 1)
  const times = dose.doseTimes

  async function handleToggle(index: number, checked: boolean) {
    const user = auth.currentUser
    if (!user || !dose) return
    await setDoseTaken(user.uid, dose, taken, index, checked)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      titleId="dose-check-title"
      title={dose.name}
      headerAction={
        <Link to={`/doses/${dose.id}/edit`} className="icon-btn" aria-label="Edit dose">
          <Icon name="pencil" size={14} />
        </Link>
      }
    >
      {dose.dose && <p className="dose-check-amount">{dose.dose}</p>}

      {Array.from({ length: dosesPerDay }).map((_, i) => (
        <label className="checkbox-row" key={i}>
          <input
            type="checkbox"
            checked={taken[i] ?? false}
            onChange={(e) => handleToggle(i, e.target.checked)}
          />
          Dose {i + 1}
          {times?.[i] ? ` (${formatTimeOfDay(times[i])})` : ''}
        </label>
      ))}

      <button
        type="button"
        className="btn btn-primary btn-full"
        onClick={onClose}
      >
        Done
      </button>
    </Modal>
  )
}

export default DoseCheckModal
