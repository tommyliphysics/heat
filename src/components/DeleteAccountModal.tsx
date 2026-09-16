import { useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import Modal from './Modal.tsx'
import { hasPasswordProvider, reauthenticate, requestAccountDeletion } from '../lib/account.ts'

type DeleteAccountModalProps = {
  open: boolean
  onClose: () => void
  user: User
  onRequested: () => void
}

/**
 * Re-proves identity (password accounts: typed email + password, checked
 * against the account's own `user.email` before attempting the Firebase
 * reauth itself, so a typo surfaces as "email doesn't match" rather than a
 * confusing auth failure; Google-only accounts: a fresh Google sign-in, same
 * as every other sensitive change on this page) before recording the
 * deletion request itself — see `requestAccountDeletion`'s doc comment for
 * why this only ever sets a flag, never deletes anything client-side.
 */
function DeleteAccountModal({ open, onClose, user, onRequested }: DeleteAccountModalProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setEmail('')
      setPassword('')
      setError('')
      setSubmitting(false)
    }
  }, [open])

  const hasPassword = hasPasswordProvider(user)

  async function handleConfirm() {
    setError('')

    if (hasPassword && email.trim().toLowerCase() !== (user.email ?? '').toLowerCase()) {
      setError("That email doesn't match this account.")
      return
    }

    setSubmitting(true)
    try {
      await reauthenticate(user, password)
    } catch {
      setError('Could not verify your details. Please try again.')
      setSubmitting(false)
      return
    }

    try {
      await requestAccountDeletion(user.uid)
      onRequested()
      onClose()
    } catch {
      setError('Something went wrong requesting deletion. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleClose() {
    if (submitting) return
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} titleId="delete-account-title" title="Delete Account?">
      <p className="confirm-delete-text">
        This flags your account for deletion — your data will be permanently
        erased once it's processed. This can't be undone.
      </p>

      {hasPassword ? (
        <>
          <label htmlFor="delete-account-email">Email</label>
          <input
            id="delete-account-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            disabled={submitting}
          />

          <label htmlFor="delete-account-password">Password</label>
          <input
            id="delete-account-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            disabled={submitting}
          />
        </>
      ) : (
        <p className="account-hint">
          You'll be asked to confirm with Google before this takes effect.
        </p>
      )}

      {error && <p className="form-error">{error}</p>}

      <div className="confirm-delete-actions">
        <button type="button" className="btn btn-secondary" onClick={handleClose} disabled={submitting}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-danger"
          onClick={handleConfirm}
          disabled={submitting || (hasPassword && (!email || !password))}
        >
          {submitting ? 'Deleting...' : 'Delete Account'}
        </button>
      </div>
    </Modal>
  )
}

export default DeleteAccountModal
