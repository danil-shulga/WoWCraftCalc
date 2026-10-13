import type { ReactNode } from 'react'
import './ItemTreeRow.css'

interface ItemTreeRowProps {
  className: string
  hasRecipe: boolean
  hasCycle: boolean
  isExpanded: boolean
  onToggle: () => void
  children: ReactNode
}

export function ItemTreeRow({
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
      className={`item-tree-row ${className}`}
      role={canExpand ? 'button' : undefined}
      tabIndex={canExpand ? 0 : undefined}
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
        if (
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
        {hasRecipe ? (isExpanded ? '▾' : '▸') : '·'}
      </span>
      {children}
    </article>
  )
}
