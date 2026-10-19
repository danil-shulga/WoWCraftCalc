import { useMemo, useState } from 'react'
import type { ItemLanguage } from '../../domain/user-settings'
import type { ProfitabilityMode } from '../../domain/profitability'
import { ProfitableItemRow, type ProfitableDisplayRow } from './ProfitableItemRow'
import { Button } from '../../components/ui/Button/Button'
import {
  PROFITABILITY_LABELS,
  type ProfitabilitySort,
  type ProfitabilitySortKey,
} from './profitability-presentation'
import './ProfitableList.css'

interface ListProps {
  rows: readonly ProfitableDisplayRow[]
  mode: ProfitabilityMode
  language: ItemLanguage
  sort: ProfitabilitySort
  onSort: (key: ProfitabilitySortKey) => void
}

// Последние данные уходящих строк живут только в представлении, расчёт их не ждёт.
export function ProfitableList({ rows, mode, language, sort, onSort }: ListProps) {
  const [previousMode, setPreviousMode] = useState(mode)
  const [previous, setPrevious] = useState(rows)
  const [display, setDisplay] = useState(() =>
    rows.map((row) => ({ ...row, entering: false })),
  )
  const liveIds = useMemo(() => new Set(rows.map(({ item }) => item.id)), [rows])
  if (previousMode !== mode) {
    setPreviousMode(mode)
    setPrevious(rows)
    setDisplay(rows.map((row) => ({ ...row, entering: false })))
  } else if (previous !== rows) {
    const previousIds = new Set(previous.map(({ item }) => item.id))
    setPrevious(rows)
    setDisplay((current) => {
      const byId = new Map(current.map((row) => [row.item.id, row]))
      const next = rows.map((row) => ({
        ...row,
        entering: byId.has(row.item.id)
          ? previousIds.has(row.item.id) && (byId.get(row.item.id)?.entering ?? false)
          : true,
      }))
      current.forEach((row, index) => {
        if (!liveIds.has(row.item.id)) next.splice(Math.min(index, next.length), 0, row)
      })
      return next
    })
  }
  const labels = PROFITABILITY_LABELS[mode]
  const columns: { key: ProfitabilitySortKey; label: string }[] = [
    { key: 'name', label: 'Предмет' },
    { key: 'cost', label: labels.cost },
    ...(mode === 'disenchant' ? [{ key: 'craftCost' as const, label: 'Крафт' }] : []),
    { key: 'gross', label: labels.sale },
    { key: 'gain', label: labels.gain },
    { key: 'percent', label: labels.rate },
  ]
  if (!display.length) return null
  return (
    <div
      role="table"
      aria-label={`Выгодные: ${labels.label}`}
      className="profitable-list"
      data-mode={mode}
    >
      <div role="rowgroup">
        <div role="row" className="profitable-list__cells profitable-list__head">
          {columns.map(({ key, label }) => (
            <div
              role="columnheader"
              key={key}
              aria-label={label}
              aria-sort={sort.key === key ? sort.direction : undefined}
            >
              <Button
                variant="plain"
                className="profitable-list__sort"
                aria-label={`Сортировать: ${label}`}
                onClick={() => {
                  onSort(key)
                }}
              >
                {label}
                {sort.key === key ? (
                  <span aria-hidden="true">
                    {sort.direction === 'ascending' ? '↑' : '↓'}
                  </span>
                ) : null}
              </Button>
            </div>
          ))}
        </div>
      </div>
      <div role="rowgroup">
        {display.map((row) => {
          const removing = !liveIds.has(row.item.id)
          return (
            <div
              role="row"
              key={row.item.id}
              className="profitable-list__animated"
              data-item-id={row.item.id}
              data-removing={removing || undefined}
              data-entering={(!removing && row.entering) || undefined}
              inert={removing}
              aria-hidden={removing || undefined}
              onAnimationEnd={(event) => {
                if (event.target !== event.currentTarget) return
                setDisplay((current) =>
                  removing
                    ? current.filter((entry) => entry.item.id !== row.item.id)
                    : current.map((entry) =>
                        entry.item.id === row.item.id
                          ? { ...entry, entering: false }
                          : entry,
                      ),
                )
              }}
            >
              <div className="profitable-list__clip" role="presentation">
                <ProfitableItemRow
                  item={row.item}
                  result={row.result}
                  language={language}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
