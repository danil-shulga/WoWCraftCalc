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

export function ItemName({
  item,
  language,
  showSecondaryName = true,
  primaryAs: Primary = 'span',
  fitWrappedText = false,
}: ItemNameProps) {
  const nameRef = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    const name = nameRef.current
    const identity = name?.parentElement?.parentElement
    if (!fitWrappedText || !name || !identity) return

    const fitText = () => {
      // Measure after wrapping at the available width, then discard unused space.
      name.style.width = ''
      let width = 0
      for (const line of name.children) {
        const range = document.createRange()
        range.selectNodeContents(line)
        if (typeof range.getClientRects !== 'function') continue
        for (const rect of range.getClientRects()) width = Math.max(width, rect.width)
      }
      if (width > 0) name.style.width = `${String(Math.ceil(width))}px`
    }
    fitText()
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fitText)
    observer?.observe(identity)
    return () => {
      observer?.disconnect()
      name.style.width = ''
    }
  }, [fitWrappedText, item, language, showSecondaryName, Primary])

  const secondaryName = showSecondaryName ? getSecondaryItemName(item, language) : null
  const Container = Primary === 'h3' ? 'div' : 'span'
  return (
    <Container
      className="item-name"
      ref={(node) => {
        nameRef.current = node
      }}
    >
      <Primary>{getItemName(item, language)}</Primary>
      {secondaryName ? (
        <small className="item-name__secondary">{secondaryName}</small>
      ) : null}
    </Container>
  )
}
