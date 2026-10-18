import { useCallback, useEffect, useRef, useState } from 'react'
import type { MouseEvent, PointerEvent } from 'react'
import type { ItemId } from '../domain/item.types'

interface TreePosition {
  element: HTMLElement
  id: ItemId
  top: number
  height: number
}

interface DragSession {
  sourceId: ItemId
  pointerId: number
  sourceIndex: number
  destination: number
  trees: TreePosition[]
  startX: number
  startY: number
  startScrollY: number
  x: number
  y: number
  active: boolean
  settling: boolean
  capture: HTMLElement
  frame: number
  timer: ReturnType<typeof setTimeout> | null
}

export function useRootItemDrag(
  items: readonly { id: ItemId }[],
  onMove: (itemId: ItemId, targetId: ItemId, position: 'before' | 'after') => void,
) {
  const listRef = useRef<HTMLDivElement>(null)
  const session = useRef<DragSession | null>(null)
  const [draggingId, setDraggingId] = useState<ItemId | null>(null)
  const [dropTarget, setDropTarget] = useState<{ top: number; height: number } | null>(
    null,
  )

  useEffect(() => {
    const clearStyles = (drag: DragSession) => {
      listRef.current?.removeAttribute('data-drag-layout')
      for (const { element } of drag.trees) {
        element.style.removeProperty('transform')
        element.classList.remove('item-tree--moving', 'item-tree--settling')
      }
      if (
        typeof drag.capture.hasPointerCapture === 'function' &&
        drag.capture.hasPointerCapture(drag.pointerId)
      )
        drag.capture.releasePointerCapture(drag.pointerId)
      cancelAnimationFrame(drag.frame)
      if (drag.timer !== null) clearTimeout(drag.timer)
    }

    const paint = (drag: DragSession) => {
      const source = drag.trees[drag.sourceIndex]
      const list = listRef.current
      if (!source || !list) return
      const first = drag.trees[0]
      const last = drag.trees.at(-1)
      if (!first || !last) return
      const desiredTop =
        source.top + drag.y - drag.startY + window.scrollY - drag.startScrollY
      const movingTop = Math.max(
        first.top,
        Math.min(last.top + last.height - source.height, desiredTop),
      )
      const offset = movingTop - source.top
      let nearestDistance = Infinity
      drag.trees.forEach((tree, index) => {
        const slotTop =
          index > drag.sourceIndex ? tree.top + tree.height - source.height : tree.top
        const distance = Math.abs(slotTop - movingTop)
        if (distance < nearestDistance) {
          nearestDistance = distance
          drag.destination = index
        }
      })
      const rowGap = Number.parseFloat(getComputedStyle(list).rowGap)
      const gap = Number.isFinite(rowGap) ? rowGap : 10
      const shift = source.height + gap
      drag.trees.forEach(({ element }, index) => {
        let translate = 0
        if (index === drag.sourceIndex) translate = offset
        else if (index > drag.sourceIndex && index <= drag.destination) translate = -shift
        else if (index < drag.sourceIndex && index >= drag.destination) translate = shift
        element.style.transform = `translateY(${String(translate)}px)`
      })
      const target = drag.trees[drag.destination]
      if (!target) return
      const top =
        drag.destination > drag.sourceIndex
          ? target.top + target.height - source.height
          : target.top
      const next = {
        top: top - list.getBoundingClientRect().top - window.scrollY,
        height: source.height,
      }
      setDropTarget((current) =>
        current?.top === next.top && current.height === next.height ? current : next,
      )
    }

    const settle = (commit: boolean) => {
      const drag = session.current
      if (!drag || drag.settling) return
      if (!drag.active) {
        clearStyles(drag)
        session.current = null
        return
      }
      drag.settling = true
      cancelAnimationFrame(drag.frame)
      const source = drag.trees[drag.sourceIndex]
      const target = drag.trees[drag.destination]
      if (!source || !target) return
      source.element.classList.remove('item-tree--moving')
      source.element.classList.add('item-tree--settling')
      const targetTop =
        drag.destination > drag.sourceIndex
          ? target.top + target.height - source.height
          : target.top
      source.element.style.transform = `translateY(${String(commit ? targetTop - source.top : 0)}px)`
      if (!commit)
        drag.trees.forEach(({ element }, index) => {
          if (index !== drag.sourceIndex) element.style.transform = 'translateY(0px)'
        })
      setDropTarget(null)
      drag.timer = setTimeout(
        () => {
          clearStyles(drag)
          session.current = null
          if (commit && drag.destination !== drag.sourceIndex)
            onMove(
              source.id,
              target.id,
              drag.destination < drag.sourceIndex ? 'before' : 'after',
            )
          setDraggingId(null)
        },
        typeof window.matchMedia === 'function' &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 0
          : 180,
      )
    }

    let lastTime: number | null = null
    const tick = (time: number) => {
      const drag = session.current
      if (!drag?.active || drag.settling) return
      const elapsed = lastTime === null ? 16 : Math.min(time - lastTime, 32)
      lastTime = time
      const bounds = listRef.current?.getBoundingClientRect()
      if (bounds && drag.x >= bounds.left && drag.x <= bounds.right) {
        const edge = 80
        const speed =
          drag.y < edge
            ? -Math.min(1, (edge - drag.y) / edge)
            : drag.y > window.innerHeight - edge
              ? Math.min(1, (drag.y - window.innerHeight + edge) / edge)
              : 0
        if (speed) window.scrollBy({ top: speed * elapsed * 0.9, behavior: 'instant' })
      }
      paint(drag)
      drag.frame = requestAnimationFrame(tick)
    }

    const move = (event: globalThis.PointerEvent) => {
      const drag = session.current
      if (drag?.pointerId !== event.pointerId || drag.settling) return
      drag.x = event.clientX
      drag.y = event.clientY
      if (!drag.active) {
        if (Math.hypot(drag.x - drag.startX, drag.y - drag.startY) < 5) return
        const list = listRef.current
        const elements = list?.querySelectorAll<HTMLElement>(
          ':scope > .item-tree:not([data-removing])',
        )
        if (!elements || !list) {
          settle(false)
          return
        }
        list.setAttribute('data-drag-layout', '')
        // Plain clicks never need list geometry. Read it once when the gesture
        // becomes a drag, before painting any transforms.
        drag.trees = Array.from(elements).flatMap((element, index): TreePosition[] => {
          const item = items[index]
          if (!item) return []
          const bounds = element.getBoundingClientRect()
          return [
            {
              element,
              id: item.id,
              top: bounds.top + window.scrollY,
              height: bounds.height,
            },
          ]
        })
        drag.sourceIndex = drag.trees.findIndex((tree) => tree.id === drag.sourceId)
        if (drag.sourceIndex === -1) {
          settle(false)
          return
        }
        drag.destination = drag.sourceIndex
        drag.active = true
        lastTime = null
        const source = drag.trees[drag.sourceIndex]
        source?.element.classList.add('item-tree--moving')
        setDraggingId(source?.id ?? null)
        drag.frame = requestAnimationFrame(tick)
      }
      event.preventDefault()
      paint(drag)
    }

    const up = (event: globalThis.PointerEvent) => {
      const drag = session.current
      if (drag?.pointerId !== event.pointerId || drag.settling) return
      drag.x = event.clientX
      drag.y = event.clientY
      if (!drag.active) {
        settle(false)
        return
      }
      paint(drag)
      const bounds = listRef.current?.getBoundingClientRect()
      settle(!!bounds && drag.x >= bounds.left && drag.x <= bounds.right)
    }
    const cancel = () => {
      settle(false)
    }
    const cancelPointer = (event: globalThis.PointerEvent) => {
      if (session.current?.pointerId === event.pointerId) cancel()
    }
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && session.current) {
        event.preventDefault()
        cancel()
      }
    }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
    document.addEventListener('pointercancel', cancelPointer)
    document.addEventListener('keydown', keyDown)
    window.addEventListener('blur', cancel)
    return () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
      document.removeEventListener('pointercancel', cancelPointer)
      document.removeEventListener('keydown', keyDown)
      window.removeEventListener('blur', cancel)
      if (session.current) clearStyles(session.current)
      session.current = null
    }
  }, [items, onMove])

  const onPointerDown = useCallback((id: ItemId, event: PointerEvent<HTMLElement>) => {
    if (
      session.current ||
      event.button !== 0 ||
      !(event.target instanceof Element) ||
      event.target.closest(
        'button, input, select, textarea, a, label, fieldset, [contenteditable="true"]',
      )
    )
      return
    session.current = {
      sourceId: id,
      pointerId: event.pointerId,
      sourceIndex: -1,
      destination: -1,
      trees: [],
      startX: event.clientX,
      startY: event.clientY,
      startScrollY: window.scrollY,
      x: event.clientX,
      y: event.clientY,
      active: false,
      settling: false,
      capture: event.currentTarget,
      frame: 0,
      timer: null,
    }
    if (typeof event.currentTarget.setPointerCapture === 'function')
      event.currentTarget.setPointerCapture(event.pointerId)
  }, [])
  const onClickCapture = useCallback((event: MouseEvent<HTMLElement>) => {
    if (session.current?.active) {
      event.preventDefault()
      event.stopPropagation()
    }
  }, [])
  return { listRef, draggingId, dropTarget, onPointerDown, onClickCapture }
}
