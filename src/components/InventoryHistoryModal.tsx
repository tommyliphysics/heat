import Modal from './Modal.tsx'
import { useUserSettings } from '../hooks/useUserSettings.ts'
import { formatShortDate, toDateStr } from '../lib/timeline.ts'
import { formatUnitLabel } from '../lib/units.ts'
import type { InventoryBatchItem } from '../types/food.ts'

type InventoryHistoryModalProps = {
  open: boolean
  onClose: () => void
  batch: InventoryBatchItem | null
}

/** Auto-decrement entries are stamped at local noon of the day they account for (see `lib/inventoryReconcile.ts`) — showing a clock time next to those would read as more precise than it is, so only manual edits (which carry a real time-of-day) get one. */
function isMiddayStamp(timestamp: number): boolean {
  const date = new Date(timestamp)
  return date.getHours() === 12 && date.getMinutes() === 0 && date.getSeconds() === 0
}

function InventoryHistoryModal({ open, onClose, batch }: InventoryHistoryModalProps) {
  const { dateFormat } = useUserSettings()
  if (!batch) return null

  const history = [...(batch.remainingHistory ?? [])].reverse()

  return (
    <Modal
      open={open}
      onClose={onClose}
      titleId="inventory-history-title"
      title={`History — ${batch.foodName}`}
    >
      {history.length === 0 ? (
        <p>No changes recorded yet.</p>
      ) : (
        <ul className="inventory-history-list">
          {history.map((entry, i) => {
            const date = new Date(entry.timestamp)
            const dateStr = formatShortDate(toDateStr(date), dateFormat)
            const label = isMiddayStamp(entry.timestamp)
              ? dateStr
              : `${dateStr}, ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`

            return (
              <li key={i} className="inventory-history-row">
                <span className="inventory-history-date">{label}</span>
                <span className="cell-mono">
                  {entry.amount}
                  {formatUnitLabel(batch.unit)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}

export default InventoryHistoryModal
