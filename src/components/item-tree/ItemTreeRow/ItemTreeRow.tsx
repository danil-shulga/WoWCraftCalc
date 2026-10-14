import type { HTMLAttributes, ReactNode } from 'react'
import './ItemTreeRow.css'

interface ItemTreeRowProps {
  dragAndDrop?: HTMLAttributes<HTMLElement> | undefined
  className: string
  hasRecipe: boolean
  hasCycle: boolean
  isExpanded: boolean
  onToggle: () => void
  children: ReactNode
}

export function ItemTreeRow({
  dragAndDrop,
  className,
  hasRecipe,
  hasCycle,
  isExpanded,
  onToggle,
  children,
}: ItemTreeRowProps) {
  const canExpand = hasRecipe && !hasCycle

  return (
    <article
      {...dragAndDrop}
      className={`item-tree-row ${className} ${dragAndDrop?.className ?? ''}`}
      role={canExpand ? 'button' : undefined}
      tabIndex={canExpand || dragAndDrop ? 0 : undefined}
      aria-label={
        canExpand ? (isExpanded ? 'Свернуть рецепт' : 'Развернуть рецепт') : undefined
      }
      aria-expanded={canExpand ? isExpanded : undefined}
      onClick={(event) => {
        if (
          canExpand &&
          event.target instanceof Element &&
          !event.target.closest(
            'button, input, select, textarea, a, label, fieldset, [contenteditable="true"]',
          )
        ) {
          onToggle()
        }
      }}
      onKeyDown={(event) => {
        dragAndDrop?.onKeyDown?.(event)
        if (
          !event.defaultPrevented &&
          canExpand &&
          event.target === event.currentTarget &&
          (event.key === 'Enter' || event.key === ' ')
        ) {
          event.preventDefault()
          onToggle()
        }
      }}
    >
      <span className="item-tree-row__indicator" aria-hidden="true">
        {hasRecipe ? '▸' : '·'}
      </span>
      {children}
    </article>
  )
}
