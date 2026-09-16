import { useState } from 'react'
import Modal from './Modal.tsx'
import type { SharedItemDiffRow } from '../lib/sharedItems.ts'

type MismatchModalProps = {
  open: boolean
  onClose: () => void
  foodName: string
  groupName: string
  diff: SharedItemDiffRow[]
  onSync: () => Promise<void>
  onAddToPersonal: () => Promise<void>
}

/**
 * Shown when adding a purchase to a group's shared inventory finds that the
 * adder's own food record doesn't match the group's already-established
 * version of that item (see `lib/sharedItems.ts`) — the add is held back
 * until the user either syncs their own record to match, or opts the
 * purchase out of the shared item entirely by logging it to their personal
 * inventory instead.
 */
function MismatchModal({
  open,
  onClose,
  foodName,
  groupName,
  diff,
  onSync,
  onAddToPersonal,
}: MismatchModalProps) {
  const [saving, setSaving] = useState<'sync' | 'personal' | null>(null)
  const [error, setError] = useState('')

  async function handleSync() {
    setError('')
    setSaving('sync')
    try {
      await onSync()
    } catch {
      setError('Could not sync. Please try again.')
      setSaving(null)
    }
  }

  async function handleAddToPersonal() {
    setError('')
    setSaving('personal')
    try {
      await onAddToPersonal()
    } catch {
      setError('Could not add to your personal inventory. Please try again.')
      setSaving(null)
    }
  }

  return (
    <Modal open={open} onClose={onClose} titleId="mismatch-title" title="Details Don't Match">
      <p>
        Your "{foodName}" doesn't match {groupName}'s existing shared version
        of it:
      </p>

      <div className="foods-table-wrap">
        <table className="foods-table">
          <thead>
            <tr>
              <th aria-hidden="true" />
              <th>Yours</th>
              <th>{groupName}'s</th>
            </tr>
          </thead>
          <tbody>
            {diff.map((row) => (
              <tr key={row.label}>
                <td>{row.label}</td>
                <td className="cell-mono">{row.mine}</td>
                <td className="cell-mono">{row.theirs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="form-hint">
        Sync your food to the group's version to add this purchase to the
        shared inventory, or add it to your own personal inventory instead
        without changing anything shared.
      </p>

      {error && <p className="form-error">{error}</p>}

      <div className="confirm-delete-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleAddToPersonal}
          disabled={saving !== null}
        >
          {saving === 'personal' ? 'Adding...' : 'Add to My Inventory Instead'}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSync}
          disabled={saving !== null}
        >
          {saving === 'sync' ? 'Syncing...' : 'Sync My Food to Match'}
        </button>
      </div>
    </Modal>
  )
}

export default MismatchModal
