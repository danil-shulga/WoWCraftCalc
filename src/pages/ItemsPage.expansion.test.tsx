import { act, fireEvent, render, screen, within } from '@testing-library/react'
import * as rootRows from '../components/item-tree/RootItemRow/RootItemRow'
import * as calculations from '../domain/calculations'
import { testCraftData } from '../test/craft-state'
import { createTreePerformanceCatalog } from '../test/performance-catalog'
import { useCraftStore } from '../store/useCraftStore'
import { ItemsPage } from './ItemsPage'

beforeEach(() => {
  useCraftStore
    .getState()
    .replaceData(testCraftData({ items: createTreePerformanceCatalog(3) }))
})
afterEach(() => {
  vi.restoreAllMocks()
})

function roots(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>('.root-item-row'))
}

it('раскрывает выбранный корень без рендера соседей и пересчёта снимка', () => {
  const rowRender = vi.spyOn(rootRows, 'RootItemRow')
  const snapshot = vi.spyOn(calculations, 'createCatalogCalculationSnapshot')
  const { container } = render(<ItemsPage section="reagents" />)
  const first = roots(container)[0]
  if (!first) throw new Error('Нет корня')
  rowRender.mockClear()
  fireEvent.click(first)
  expect(first).toHaveAttribute('aria-expanded', 'true')
  expect(rowRender.mock.calls.length).toBeGreaterThan(0)
  expect(rowRender.mock.calls.every(([props]) => props.item.id === 'product-000')).toBe(
    true,
  )
  expect(snapshot).toHaveBeenCalledTimes(1)
  rowRender.mockClear()
  const branch = first.closest('.item-tree')?.querySelector('.item-tree__expansion')
  if (!branch) throw new Error('Нет ветки')
  fireEvent.animationEnd(branch)
  expect(rowRender.mock.calls.every(([props]) => props.item.id === 'product-000')).toBe(
    true,
  )
  expect(snapshot).toHaveBeenCalledTimes(1)
})

it('хранит независимые пути общего реагента и сохраняет их после поиска и перестановки', () => {
  const { container } = render(<ItemsPage section="reagents" />)
  const [first, second] = roots(container)
  if (!first || !second) throw new Error('Нет корней')
  fireEvent.click(first)
  fireEvent.click(second)
  const firstTree = first.closest('.item-tree')
  const secondTree = second.closest('.item-tree')
  if (!(firstTree instanceof HTMLElement) || !(secondTree instanceof HTMLElement))
    throw new Error('Нет деревьев')
  const child = within(firstTree)
    .getByText('Промежуточный реагент с длинным названием 0')
    .closest('article')
  if (!child) throw new Error('Нет вложенной строки')
  fireEvent.click(child)
  expect(within(firstTree).getByText('Shared material 0')).toBeInTheDocument()
  expect(within(secondTree).queryByText('Shared material 0')).not.toBeInTheDocument()
  fireEvent.change(screen.getByRole('searchbox'), {
    target: { value: 'Test product 002' },
  })
  expect(roots(container)).toHaveLength(1)
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } })
  expect(screen.getByText('Shared material 0')).toBeInTheDocument()
  act(() => {
    useCraftStore
      .getState()
      .moveRootItem('reagents', 'product-000', 'product-002', 'after')
  })
  expect(roots(container).at(-1)).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByText('Shared material 0')).toBeInTheDocument()
})

it('обновляет раскрытое дерево при правках каталога и языка после мемоизации', () => {
  const { container } = render(<ItemsPage section="reagents" />)
  const first = roots(container)[0]
  if (!first) throw new Error('Нет корня')
  fireEvent.click(first)
  const tree = first.closest('.item-tree')
  if (!(tree instanceof HTMLElement)) throw new Error('Нет дерева')
  act(() => {
    useCraftStore.getState().setItemPrice('branch-0', 'purchasePriceCopper', 54321)
  })
  const child = within(tree)
    .getByText('Промежуточный реагент с длинным названием 0')
    .closest('article')
  expect(child?.textContent).toContain('5')
  expect(child?.querySelector('.money-display__part > span')).toHaveTextContent('5')
  act(() => {
    useCraftStore.getState().setItemLanguage('en')
  })
  expect(first).toHaveAttribute('aria-expanded', 'true')
  expect(within(first).getByText('Test product 000').tagName).toBe('STRONG')
})
