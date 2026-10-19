import { act, fireEvent, render, screen } from '@testing-library/react'
import { items } from '../test/items-page-fixture'
import { testCraftData, setTestCraftState } from '../test/craft-state'
import { useCraftStore } from '../store/useCraftStore'
import { ItemsPage } from './ItemsPage'

beforeEach(() => {
  useCraftStore.getState().replaceData(testCraftData({ items }))
})

function tree(name: string) {
  const element = screen.getByText(name).closest('.item-tree')
  if (!element) throw new Error('Нет дерева')
  return element
}

it('показывает исходные строки сразу, но анимирует добавленные после открытия', () => {
  const potion = items.potion
  if (!potion) throw new Error('Нет предмета')
  setTestCraftState({ items: { potion } })
  const view = render(<ItemsPage section="crafts" />)
  expect(tree('Лечебное зелье')).not.toHaveClass('item-tree--entering')
  act(() => {
    setTestCraftState({ items })
  })
  expect(tree('Шерстяная сумка')).toHaveClass('item-tree--entering')
  fireEvent.animationEnd(tree('Шерстяная сумка'))
  expect(tree('Шерстяная сумка')).not.toHaveClass('item-tree--entering')
  view.unmount()
  render(<ItemsPage section="crafts" />)
  expect(tree('Шерстяная сумка')).not.toHaveClass('item-tree--entering')
})

it('сохраняет список до собственного animationend последней уходящей строки', () => {
  const potion = items.potion
  if (!potion) throw new Error('Нет предмета')
  setTestCraftState({ items: { potion } })
  const view = render(<ItemsPage section="crafts" />)
  const row = tree('Лечебное зелье')
  fireEvent.animationEnd(row)
  act(() => {
    useCraftStore.getState().removeItem('potion')
  })
  expect(row).toHaveAttribute('inert')
  expect(row).toHaveAttribute('aria-hidden', 'true')
  expect(view.container.querySelector('.item-list')).toBeInTheDocument()
  expect(useCraftStore.getState().workspaces.forever.items).toEqual({})
  fireEvent.animationEnd(screen.getByText('Лечебное зелье'))
  expect(row).toBeInTheDocument()
  fireEvent.animationEnd(row)
  expect(view.container.querySelector('.item-list')).not.toBeInTheDocument()
  expect(screen.getByText('Здесь пока ничего нет')).toBeVisible()
})

it('сохраняет все последние строки при массовом удалении и отменяет уход при повторном добавлении', () => {
  const view = render(<ItemsPage section="crafts" />)
  const potion = tree('Лечебное зелье')
  const bag = tree('Шерстяная сумка')
  fireEvent.animationEnd(potion)
  fireEvent.animationEnd(bag)
  act(() => {
    useCraftStore.getState().removeItem('potion')
    useCraftStore.getState().removeItem('bag')
  })
  expect(view.container.querySelectorAll('.item-tree--removing')).toHaveLength(2)
  act(() => {
    setTestCraftState({ items })
  })
  expect(tree('Лечебное зелье')).toBe(potion)
  expect(tree('Шерстяная сумка')).toBe(bag)
  expect(view.container.querySelectorAll('.item-tree--removing')).toHaveLength(0)
  expect(view.container.querySelectorAll('.item-tree--entering')).toHaveLength(0)
  expect(view.container.querySelectorAll('.root-item-row')).toHaveLength(2)
  fireEvent.animationEnd(potion)
  expect(potion).toBeInTheDocument()
})

it('обновляет количество плана без повторного появления строки', () => {
  render(<ItemsPage section="crafts" />)
  const row = tree('Лечебное зелье')
  fireEvent.animationEnd(row)
  act(() => {
    useCraftStore.getState().setPlannerQuantity('potion', 3)
  })
  expect(screen.getByRole('spinbutton')).toHaveValue(3)
  act(() => {
    useCraftStore.getState().setPlannerQuantity('potion', 5)
  })
  expect(screen.getByRole('spinbutton')).toHaveValue(5)
  expect(tree('Лечебное зелье')).toBe(row)
  expect(row).not.toHaveClass('item-tree--entering')
})
