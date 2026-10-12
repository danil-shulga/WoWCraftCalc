import { useEffect, useId, useRef, type ReactNode } from 'react'

import '../IconButton.css'
import './Modal.css'

interface ModalProps {
  title: string
  subtitle?: string | null
  children: ReactNode
  onClose: () => void
}

const focusableSelector = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')
const dialogStack: HTMLElement[] = []
const dialogFocus = new WeakMap<HTMLElement, HTMLElement>()

export function Modal({ title, subtitle, children, onClose }: ModalProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        dialogStack.at(-1) === dialogRef.current &&
        !event.defaultPrevented
      ) {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  useEffect(() => {
    const dialog = dialogRef.current
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    if (dialog === null) {
      return
    }
    dialogStack.push(dialog)
    const rememberFocus = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement && dialog.contains(event.target))
        dialogFocus.set(dialog, event.target)
    }
    dialog.addEventListener('focusin', rememberFocus)

    if (!dialog.contains(document.activeElement)) {
      const firstFocusable = dialog.querySelector<HTMLElement>(focusableSelector)
      ;(firstFocusable ?? dialog).focus()
    }

    const keepFocusInside = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || dialogStack.at(-1) !== dialog) {
        return
      }

      const focusableElements = [
        ...dialog.querySelectorAll<HTMLElement>(focusableSelector),
      ].filter((element) => element.closest('[hidden], [inert]') === null)

      if (focusableElements.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const firstElement = focusableElements[0]
      const lastElement = focusableElements.at(-1)

      if (firstElement === undefined || lastElement === undefined) {
        return
      }

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault()
        lastElement.focus()
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault()
        firstElement.focus()
      }
    }

    document.addEventListener('keydown', keepFocusInside)

    return () => {
      document.removeEventListener('keydown', keepFocusInside)
      dialog.removeEventListener('focusin', rememberFocus)
      const index = dialogStack.indexOf(dialog)
      if (index >= 0) dialogStack.splice(index, 1)
      const underlying = dialogStack.at(-1)
      const restore =
        underlying && !underlying.contains(previouslyFocused)
          ? (dialogFocus.get(underlying) ?? underlying)
          : previouslyFocused
      if (restore?.isConnected) restore.focus()
    }
  }, [])

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <section
        ref={dialogRef}
        className="modal"
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="modal__header">
          <div className="modal__title">
            <h2 id={titleId}>{title}</h2>
            {subtitle ? <small>{subtitle}</small> : null}
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        {children}
      </section>
    </div>
  )
}
