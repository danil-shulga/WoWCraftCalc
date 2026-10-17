import { useRef } from 'react'
import { Button } from '../../components/ui/Button/Button'
import { IconButton } from '../../components/ui/IconButton/IconButton'
import { ItemIdentity } from '../../components/ui/ItemIdentity/ItemIdentity'
import type { ReferenceDatabaseIndex } from '../../domain/reference-database-index'
import { referenceItemName } from '../../domain/reference-database-index'
import type { ItemLanguage } from '../../domain/user-settings'

export function ReferenceSelection({
  index,
  itemLanguage,
  selectedIds,
  rows,
  previewId,
  onOpen,
  onRemove,
  onClear,
  onExit,
}: {
  index: ReferenceDatabaseIndex
  itemLanguage: ItemLanguage
  selectedIds: number[]
  rows: number[]
  previewId: number | null
  onOpen: (id: number) => void
  onRemove: (id: number) => void
  onClear: () => void
  onExit: (id: number) => void
}) {
  const buttons = useRef(new Map<number, HTMLButtonElement>())
  const heading = useRef<HTMLHeadingElement>(null)
  return (
    <section aria-label="Выбранные предметы" className="reference-db__selection">
      <div className="reference-db__selection-heading">
        <h3 ref={heading} tabIndex={-1}>
          Выбрано: {selectedIds.length}
        </h3>
        <Button
          type="button"
          variant="danger-text"
          disabled={!selectedIds.length}
          onClick={() => {
            heading.current?.focus()
            onClear()
          }}
        >
          Очистить выбор
        </Button>
      </div>
      <ul className="reference-db__selected-list">
        {rows.map((id) => {
          const item = index.database.items[String(id)]
          if (!item) return null
          const removing = !selectedIds.includes(id)
          return (
            <li
              key={id}
              className="reference-db__selected-row"
              data-removing={removing || undefined}
              inert={removing}
              aria-hidden={removing}
              onAnimationEnd={(event) => {
                if (event.target === event.currentTarget && removing) onExit(id)
              }}
            >
              <div className="reference-db__selected-clip">
                <div className="reference-db__selected-content">
                  <Button
                    ref={(button) => {
                      if (button) buttons.current.set(id, button)
                      else buttons.current.delete(id)
                    }}
                    type="button"
                    variant="plain"
                    className="reference-db__selected-name"
                    aria-pressed={previewId === id}
                    onClick={() => {
                      onOpen(id)
                    }}
                  >
                    <ItemIdentity
                      item={{ ...item, name: String(id) }}
                      language={itemLanguage}
                      iconSize="small"
                    />
                  </Button>
                  <IconButton
                    type="button"
                    variant="danger"
                    aria-label={`Убрать из выбора: ${referenceItemName(item, itemLanguage)}`}
                    onClick={() => {
                      const position = selectedIds.indexOf(id)
                      const nextId =
                        selectedIds[position + 1] ?? selectedIds[position - 1]
                      if (nextId === undefined) heading.current?.focus()
                      else buttons.current.get(nextId)?.focus()
                      onRemove(id)
                    }}
                  >
                    ×
                  </IconButton>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
