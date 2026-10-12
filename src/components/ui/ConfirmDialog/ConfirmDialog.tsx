import { Button } from '../Button/Button'
import type { ReactNode } from 'react'
import { Modal } from '../Modal/Modal'
import './ConfirmDialog.css'

interface ConfirmDialogProps {
  title: string
  message: ReactNode
  confirmLabel: string
  cancelLabel?: string
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Отмена',
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Modal title={title} onClose={onCancel}>
      <div className="confirm-dialog">
        <p>{message}</p>
        <footer className="confirm-dialog__actions">
          <Button variant="secondary" type="button" autoFocus onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant="danger" type="button" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </footer>
      </div>
    </Modal>
  )
}
