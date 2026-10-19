import { requireValue } from '../../test/require-value'
import { fireEvent, render, screen } from '@testing-library/react'
import {
  createProfitabilitySnapshot,
  calculateProfitability,
} from '../../domain/profitability'
import { DEFAULT_TSM_SETTINGS } from '../../domain/tsm'
import { profitabilityCatalog } from '../../test/profitability-fixture'
import { ProfitableList } from './ProfitableList'
const sorting = {
  sort: { key: 'gain', direction: 'descending' } as const,
  onSort: vi.fn(),
}
const rows = createProfitabilitySnapshot(
  profitabilityCatalog,
  'craft',
  new Set(['tailoring']),
  { version: 'tbc', settings: DEFAULT_TSM_SETTINGS, snapshot: null },
).map((result) => ({
  item: requireValue(profitabilityCatalog[result.itemId]),
  result: calculateProfitability(result),
}))
it('показывает исходные строки и переключает режимы сразу, анимируя новые строки', () => {
  const view = render(
    <ProfitableList rows={rows} mode="craft" language="ru" {...sorting} />,
  )
  expect(view.container.querySelector('[data-entering]')).toBeNull()
  for (const mode of ['disenchant', 'craft'] as const) {
    view.rerender(
      <ProfitableList rows={rows.slice(0, 1)} mode={mode} language="ru" {...sorting} />,
    )
    expect(screen.getAllByRole('row')).toHaveLength(2)
    expect(view.container.querySelector('[data-entering]')).toBeNull()
    expect(view.container.querySelector('[data-removing]')).toBeNull()
  }
  view.rerender(<ProfitableList rows={rows} mode="craft" language="ru" {...sorting} />)
  expect(view.container.querySelectorAll('[data-entering]')).toHaveLength(rows.length - 1)
})

it('анимирует появление, последнюю строку и быстрое возвращение без дублей', () => {
  const view = render(
    <ProfitableList rows={[]} mode="craft" language="ru" {...sorting} />,
  )
  view.rerender(
    <ProfitableList rows={rows.slice(0, 1)} mode="craft" language="ru" {...sorting} />,
  )
  const row = requireValue(screen.getAllByRole('row')[1])
  expect(row).toHaveAttribute('data-entering')
  fireEvent.animationEnd(row)
  view.rerender(<ProfitableList rows={[]} mode="craft" language="ru" {...sorting} />)
  expect(row).toHaveAttribute('inert')
  expect(row).toHaveAttribute('aria-hidden', 'true')
  expect(screen.getByRole('table')).toBeInTheDocument()
  view.rerender(
    <ProfitableList rows={rows.slice(0, 1)} mode="craft" language="ru" {...sorting} />,
  )
  expect(screen.getAllByRole('row')[1]).toBe(row)
  expect(row).not.toHaveAttribute('data-entering')
  expect(row).not.toHaveAttribute('data-removing')
  view.rerender(<ProfitableList rows={[]} mode="craft" language="ru" {...sorting} />)
  fireEvent.animationEnd(requireValue(row.firstElementChild))
  expect(row).toBeInTheDocument()
  fireEvent.animationEnd(row)
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
})
it('сохраняет последние данные при очистке и не перезапускает появление при пересчёте', () => {
  const view = render(
    <ProfitableList rows={rows} mode="craft" language="ru" {...sorting} />,
  )
  const displayed = screen.getAllByRole('row').slice(1)
  displayed.forEach((row) => fireEvent.animationEnd(row))
  view.rerender(
    <ProfitableList
      rows={rows.map((row) => ({ ...row, result: { ...row.result, gain: 22222 } }))}
      mode="craft"
      language="ru"
      {...sorting}
    />,
  )
  displayed.forEach((row) => {
    expect(row).not.toHaveAttribute('data-entering')
  })
  view.rerender(<ProfitableList rows={[]} mode="craft" language="ru" {...sorting} />)
  expect(view.container.querySelectorAll('[data-removing]')).toHaveLength(2)
  displayed.forEach((row) => fireEvent.animationEnd(row))
  expect(view.container.querySelector('[data-removing]')).not.toBeInTheDocument()
})
