import { useEffect, useState } from 'react'
import Modal from './Modal.tsx'

type ConfirmDeleteModalProps = {
  open: boolean
  onClose: () => void
  onConfirm: () => Promise<void>
  title: string
  message: string
  /** Overrides the confirm button's resting/in-flight labels — for a non-delete destructive action (e.g. disconnecting) reusing this same confirm-then-act shape. Defaults to "Delete"/"Deleting..." for every existing (genuinely delete) usage. */
  confirmLabel?: string
  confirmingLabel?: string
  errorMessage?: string
}

function ConfirmDeleteModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Delete',
  confirmingLabel = 'Deleting...',
  errorMessage = 'Could not delete. Please try again.',
}: ConfirmDeleteModalProps) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  // Every existing usage happens to navigate away (or gets `key`-remounted)
  // on a successful confirm, which incidentally resets this component's
  // state — but this instance never unmounts on its own success path (it
  // just goes `open={false}` while the page underneath stays permanently
  // mounted, per PageRegistry.tsx), so without this it would stay stuck
  // showing `confirmingLabel` the next time it's reopened for a *different*
  // target. Resetting on every open, rather than relying on the caller's
  // navigation habits, makes this safe for a caller that doesn't navigate.
  useEffect(() => {
    if (open) {
      setDeleting(false)
      setError('')
    }
  }, [open])

  async function handleConfirm() {
    setError('')
    setDeleting(true)
    try {
      await onConfirm()
    } catch {
      setError(errorMessage)
      setDeleting(false)
    }
  }

  function handleClose() {
    if (deleting) return
    setError('')
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      titleId="confirm-delete-title"
      title={title}
    >
      <p className="confirm-delete-text">{message}</p>

      {error && <p className="form-error">{error}</p>}

      <div className="confirm-delete-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleClose}
          disabled={deleting}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-danger"
          onClick={handleConfirm}
          disabled={deleting}
        >
          {deleting ? confirmingLabel : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

export default ConfirmDeleteModal
