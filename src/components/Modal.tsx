import type { ReactNode } from 'react'
import Icon from './Icon.tsx'

type ModalProps = {
  open: boolean
  onClose: () => void
  titleId: string
  title: string
  headerAction?: ReactNode
  children: ReactNode
}

function Modal({ open, onClose, titleId, title, headerAction, children }: ModalProps) {
  if (!open) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <div className="modal-header-actions">
            {headerAction}
            <button
              type="button"
              className="icon-btn modal-close-btn"
              aria-label="Close"
              onClick={onClose}
            >
              <Icon name="x" size={16} />
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}

export default Modal
