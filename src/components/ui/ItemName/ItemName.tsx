import { useLayoutEffect, useRef } from 'react'
import { getItemName, getSecondaryItemName } from '../../../domain/item-names'
import type { Item } from '../../../domain/item.types'
import type { ItemLanguage } from '../../../domain/user-settings'
import './ItemName.css'

interface ItemNameProps {
  item: Pick<Item, 'name' | 'names'>
  language: ItemLanguage
  showSecondaryName?: boolean
  primaryAs?: 'span' | 'strong' | 'h3'
  fitWrappedText?: boolean
}

const pendingFits = new Map<
  HTMLElement,
  {
    identity: HTMLElement
    onMeasured: (width: number) => void
  }
>()
let fitScheduled = false

function scheduleFit(
  name: HTMLElement,
  identity: HTMLElement,
  onMeasured: (width: number) => void,
) {
  pendingFits.set(name, { identity, onMeasured })
  if (fitScheduled) return
  fitScheduled = true
  // Layout effects from one commit share a microtask before the browser paints.
  // Keep resets, geometry reads and final writes in separate passes: opening a
  // branch must not force a whole-list layout for every newly mounted name.
  queueMicrotask(() => {
    fitScheduled = false
    const names = [...pendingFits]
    pendingFits.clear()
    for (const [element] of names) element.style.width = ''
    const measurements = names.map(([element, context]) => {
      let width = 0
      for (const line of element.children) {
        const range = document.createRange()
        range.selectNodeContents(line)
        if (typeof range.getClientRects !== 'function') continue
        for (const rect of range.getClientRects()) width = Math.max(width, rect.width)
      }
      return {
        element,
        context,
        width,
        availableWidth: context.identity.getBoundingClientRect().width,
      }
    })
    for (const { element, context, width, availableWidth } of measurements) {
      if (width > 0) element.style.width = `${String(Math.ceil(width))}px`
      context.onMeasured(availableWidth)
    }
  })
}

export function ItemName({
  item,
  language,
  showSecondaryName = true,
  primaryAs: Primary = 'span',
  fitWrappedText = false,
}: ItemNameProps) {
  const primaryName = getItemName(item, language)
  const secondaryName = showSecondaryName ? getSecondaryItemName(item, language) : null
  const nameRef = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    const name = nameRef.current
    const identity = name?.parentElement?.parentElement
    if (!fitWrappedText || !name || !identity) return

    let observedWidth: number | undefined
    const fitText = () => {
      scheduleFit(name, identity, (width) => {
        observedWidth = width
      })
    }
    fitText()
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(([entry]) => {
            if (!entry || entry.contentRect.width === observedWidth) return
            observedWidth = entry.contentRect.width
            fitText()
          })
    observer?.observe(identity)
    return () => {
      observer?.disconnect()
      pendingFits.delete(name)
      name.style.width = ''
    }
  }, [fitWrappedText, primaryName, secondaryName, Primary])

  const Container = Primary === 'h3' ? 'div' : 'span'
  return (
    <Container
      className="item-name"
      ref={(node) => {
        nameRef.current = node
      }}
    >
      <Primary>{primaryName}</Primary>
      {secondaryName ? (
        <small className="item-name__secondary">{secondaryName}</small>
      ) : null}
    </Container>
  )
}
