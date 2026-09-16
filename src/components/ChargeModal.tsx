import { useState } from 'react'
import Modal from './Modal.tsx'
import { auth } from '../firebase.ts'
import { proposeCharge } from '../lib/charges.ts'
import type { GroupMemberListItem } from '../types/groups.ts'

type ChargeModalProps = {
  open: boolean
  onClose: () => void
  groupId: string
  batchId: string
  foodName: string
  currency: string
  /** Every OTHER member of the group — the proposer themselves is never a valid target and shouldn't be passed in. */
  members: GroupMemberListItem[]
}

/**
 * Shown right after a purchase successfully lands in a group's shared
 * inventory — an optional prompt to ask specific other members to cover
 * part of the cost. Blank stays blank: only members given a non-empty
 * amount actually get a charge. Skippable entirely (most purchases
 * probably aren't split) — this never blocks or undoes the inventory add
 * that already happened.
 */
function ChargeModal({
  open,
  onClose,
  groupId,
  batchId,
  foodName,
  currency,
  members,
}: ChargeModalProps) {
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function handleClose() {
    setAmounts({})
    setError('')
    onClose()
  }

  async function handleSend() {
    const user = auth.currentUser
    const targeted = Object.entries(amounts).filter(([, amount]) => amount.trim())
    if (!user || targeted.length === 0) {
      handleClose()
      return
    }

    setError('')
    setSaving(true)
    try {
      await proposeCharge(
        groupId,
        batchId,
        foodName,
        user.uid,
        Object.fromEntries(
          targeted.map(([uid, amount]) => [uid, { amount, currency }]),
        ),
      )
      handleClose()
    } catch {
      setError('Could not send charges. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} titleId="charge-title" title="Charge Others?">
      <p className="form-hint">
        Ask other members of the group to cover part of "{foodName}" — leave
        blank for anyone you're not charging.
      </p>

      {members.map((member) => (
        <div key={member.uid} className="unit-row">
          <label htmlFor={`charge-${member.uid}`}>{member.email}</label>
          <input
            id={`charge-${member.uid}`}
            type="number"
            step="0.01"
            placeholder="0.00"
            value={amounts[member.uid] ?? ''}
            onChange={(e) =>
              setAmounts((current) => ({ ...current, [member.uid]: e.target.value }))
            }
          />
        </div>
      ))}

      {error && <p className="form-error">{error}</p>}

      <div className="confirm-delete-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleClose}
          disabled={saving}
        >
          Skip
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSend}
          disabled={saving}
        >
          {saving ? 'Sending...' : 'Send Charges'}
        </button>
      </div>
    </Modal>
  )
}

export default ChargeModal
