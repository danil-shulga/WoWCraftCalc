import { Modal } from '../Modal/Modal'
import '../Button.css'
import './ConfirmDialog.css'

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel: string
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Modal title={title} onClose={onCancel}>
      <div className="confirm-dialog">
        <p>{message}</p>
        <footer className="confirm-dialog__actions">
          <button
            className="button button--secondary"
            type="button"
            autoFocus
            onClick={onCancel}
          >
            Отмена
          </button>
          <button
            className="button confirm-dialog__danger-button"
            type="button"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </footer>
      </div>
    </Modal>
  )
}
