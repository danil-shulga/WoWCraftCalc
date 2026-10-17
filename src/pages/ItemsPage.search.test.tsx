import { act, fireEvent, render, screen } from '@testing-library/react'
import * as names from '../domain/item-names'
import { items } from '../test/items-page-fixture'
import { testCraftData, setTestCraftState } from '../test/craft-state'
import { useCraftStore } from '../store/useCraftStore'
import { ItemsPage } from './ItemsPage'

beforeEach(() => {
  const potion = items.potion
  const bag = items.bag
  if (!potion || !bag) throw new Error('Нет предметов')
  useCraftStore.getState().replaceData(
    testCraftData({
      items: {
        potion: {
          ...potion,
          name: 'Старое имя',
          names: { ru: 'Венец из ткани Грёз', en: 'Dreamweave Circlet' },
        },
        bag,
        legacy: {
          ...bag,
          id: 'legacy',
          name: 'Старый реагент',
          names: { ru: null, en: null },
        },
      },
    }),
  )
})
afterEach(() => {
  vi.restoreAllMocks()
})

it('готовит имена один раз, нормализует только запрос и ищет RU/EN и запасное имя', () => {
  const prepare = vi.spyOn(names, 'getItemSearchNames')
  const normalize = vi.spyOn(names, 'normalizeItemName')
  render(<ItemsPage section="crafts" />)
  expect(prepare).toHaveBeenCalledTimes(3)
  prepare.mockClear()
  const search = screen.getByRole('searchbox')
  for (const [query, label] of [
    ['  ткани   ГРЕЗ  ', 'Венец из ткани Грёз'],
    ['DREAMWEAVE', 'Венец из ткани Грёз'],
    ['старое имя', 'Венец из ткани Грёз'],
    ['старый реагент', 'Старый реагент'],
    ['wool', 'Шерстяная сумка'],
  ] as const) {
    normalize.mockClear()
    fireEvent.change(search, { target: { value: query } })
    expect(screen.getByRole('button', { name: `Редактировать ${label}` })).toBeVisible()
    expect(normalize.mock.calls).toEqual([[query]])
    expect(prepare).not.toHaveBeenCalled()
  }
  act(() => {
    useCraftStore.getState().setItemLanguage('en')
  })
  expect(screen.getByRole('button', { name: 'Редактировать Wool Bag' })).toBeVisible()
  expect(prepare).not.toHaveBeenCalled()
})

it('обновляет поисковые имена после изменения каталога при активном запросе', () => {
  render(<ItemsPage section="crafts" />)
  const search = screen.getByRole('searchbox')
  fireEvent.change(search, { target: { value: 'Dreamweave' } })
  const catalog = useCraftStore.getState().workspaces.forever.items
  const potion = catalog.potion
  if (!potion) throw new Error('Нет предмета')
  act(() => {
    setTestCraftState({
      items: {
        ...catalog,
        potion: {
          ...potion,
          name: 'Новый',
          names: { ru: 'Новый венец', en: 'New Crown' },
        },
      },
    })
  })
  expect(screen.getByText('Ничего не найдено')).toBeVisible()
  fireEvent.change(search, { target: { value: 'NEW  CROWN' } })
  expect(screen.getByRole('button', { name: 'Редактировать Новый венец' })).toBeVisible()
})

it('сохраняет последние поисковые имена уходящей строки до animationend', () => {
  const view = render(<ItemsPage section="crafts" />)
  const search = screen.getByRole('searchbox')
  fireEvent.change(search, { target: { value: 'Dreamweave' } })
  act(() => {
    useCraftStore.getState().removeItem('potion')
  })
  const leaving = view.container.querySelector('.item-tree--removing')
  expect(leaving).toBeInTheDocument()
  expect(leaving).toHaveAttribute('inert')
  fireEvent.change(search, { target: { value: 'ткани  грез' } })
  expect(leaving).toBeInTheDocument()
  if (!leaving) throw new Error('Нет уходящей строки')
  fireEvent.animationEnd(leaving)
  expect(leaving).not.toBeInTheDocument()
})
