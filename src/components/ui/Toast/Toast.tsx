import { IconButton } from '../IconButton/IconButton'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import './Toast.css'

interface ToastProps {
  message: string
  onClose: () => void
  duration?: number
}

export function Toast({ message, onClose, duration = 6000 }: ToastProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [hasFocus, setHasFocus] = useState(false)

  useEffect(() => {
    if (isHovered || hasFocus) return

    const timeout = window.setTimeout(onClose, duration)
    return () => {
      window.clearTimeout(timeout)
    }
  }, [message, onClose, duration, isHovered, hasFocus])

  return createPortal(
    <div
      className="toast"
      onMouseEnter={() => {
        setIsHovered(true)
      }}
      onMouseLeave={() => {
        setIsHovered(false)
      }}
      onFocusCapture={() => {
        setHasFocus(true)
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setHasFocus(false)
        }
      }}
    >
      <span className="toast__icon" aria-hidden="true">
        ✓
      </span>
      <p className="toast__message" role="status" aria-atomic="true">
        {message}
      </p>
      <IconButton
        className="toast__close"
        type="button"
        aria-label="Закрыть уведомление"
        onClick={onClose}
      >
        ×
      </IconButton>
    </div>,
    document.body,
  )
}
