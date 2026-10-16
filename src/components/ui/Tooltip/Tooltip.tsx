import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './Tooltip.css'

interface TooltipProps {
  children: ReactNode
  content: ReactNode
}

export function Tooltip({ children, content }: TooltipProps) {
  const id = useId()
  const triggerRef = useRef<HTMLSpanElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [open, setOpen] = useState(false)

  const cancelClose = () => {
    clearTimeout(closeTimer.current)
  }
  const show = () => {
    cancelClose()
    setOpen(true)
  }
  const hide = () => {
    cancelClose()
    closeTimer.current = setTimeout(() => {
      if (!triggerRef.current?.matches(':focus')) setOpen(false)
    }, 100)
  }

  useLayoutEffect(
    () => () => {
      clearTimeout(closeTimer.current)
    },
    [],
  )

  useLayoutEffect(() => {
    if (!open) return
    const trigger = triggerRef.current
    const panel = panelRef.current
    if (!trigger || !panel) return
    const position = () => {
      const rect = trigger.getBoundingClientRect()
      const gap = 8
      const padding = 12
      const below = window.innerHeight - rect.bottom - gap - padding
      const above = rect.top - gap - padding
      const placeAbove = panel.scrollHeight > below && above > below
      panel.style.maxHeight = `${String(Math.max(0, placeAbove ? above : below))}px`
      panel.style.left = `${String(Math.max(padding, Math.min(rect.left, window.innerWidth - panel.offsetWidth - padding)))}px`
      panel.style.top = `${String(placeAbove ? rect.top - gap - panel.offsetHeight : rect.bottom + gap)}px`
    }
    position()
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(position)
    observer?.observe(trigger)
    observer?.observe(panel)
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      clearTimeout(closeTimer.current)
      setOpen(false)
    }
    document.addEventListener('keydown', onEscape, true)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
      document.removeEventListener('keydown', onEscape, true)
    }
  }, [open, content])

  return (
    <span
      ref={triggerRef}
      className="tooltip-trigger"
      tabIndex={0}
      aria-describedby={open ? id : undefined}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={() => {
        cancelClose()
        setOpen(false)
      }}
    >
      {children}
      {open
        ? createPortal(
            <div
              ref={panelRef}
              id={id}
              role="tooltip"
              className="tooltip-panel"
              onMouseEnter={cancelClose}
              onMouseLeave={hide}
              onClick={(event) => {
                event.stopPropagation()
              }}
            >
              {content}
            </div>,
            document.body,
          )
        : null}
    </span>
  )
}
