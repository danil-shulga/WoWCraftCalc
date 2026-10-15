import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { calculateCraftPlan } from '../../domain/planner'
import type { ItemCatalog } from '../../domain/item.types'
import { ShoppingList } from './ShoppingList'
import { ShoppingListPanel } from './ShoppingListPanel'

const catalog: ItemCatalog = {
  ore: {
    id: 'ore',
    name: 'Руда',
    iconUrl: '',
    sections: ['reagents'],
    recipe: null,
    purchasePriceCopper: null,
    salePriceCopper: null,
  },
}
it('оставляет строку с неизвестной ценой и подписывает известную часть', () => {
  render(
    <ShoppingList
      catalog={catalog}
      itemLanguage="ru"
      plan={calculateCraftPlan(catalog, [{ itemId: 'ore', quantity: 4 }])}
    />,
  )
  expect(screen.getByText('Руда')).toBeVisible()
  expect(screen.getByText('× 4')).toBeVisible()
  expect(screen.getByText('Известная часть')).toBeVisible()
  const total = screen.getByText('Бюджет').closest('div')
  expect(total).not.toBeNull()
  expect(within(total as HTMLElement).getByText('не указано')).toBeVisible()
  expect(screen.getByText('Позиций без цены').nextElementSibling).toHaveTextContent('1')
})
it('не показывает пустую панель', () => {
  render(
    <ShoppingListPanel
      catalog={{}}
      itemLanguage="ru"
      plan={calculateCraftPlan({}, [])}
      onOpenPlanner={vi.fn()}
    />,
  )
  expect(screen.queryByRole('complementary', { name: 'Список покупок' })).toBeNull()
})

it('по умолчанию показывает только бюджет, раскрывает список и снова сворачивает', async () => {
  const user = userEvent.setup()
  const open = vi.fn()
  render(
    <ShoppingListPanel
      catalog={catalog}
      itemLanguage="ru"
      plan={calculateCraftPlan(catalog, [{ itemId: 'ore', quantity: 4 }])}
      onOpenPlanner={open}
    />,
  )
  expect(screen.getByRole('complementary', { name: 'Список покупок' })).toBeVisible()
  const toggle = screen.getByRole('button', { name: 'Развернуть список покупок' })
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  expect(toggle).toHaveTextContent('Бюджет')
  expect(within(toggle).getByText('не указано')).toBeVisible()
  expect(screen.getByText('Руда')).not.toBeVisible()
  expect(screen.getByText('Позиций: 1')).not.toBeVisible()
  expect(screen.queryByRole('button', { name: 'Открыть планировщик' })).toBeNull()

  toggle.focus()
  await user.keyboard('{Enter}')
  expect(toggle).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByText('Руда')).toBeVisible()
  expect(screen.getByText('Позиций: 1')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Открыть планировщик' }))
  expect(open).toHaveBeenCalledOnce()

  await user.click(screen.getByRole('button', { name: 'Свернуть список покупок' }))
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  expect(screen.getByText('Руда')).not.toBeVisible()
})

it('обновляет бюджет в свёрнутом виде и скрывает панель после очистки', () => {
  const ore = catalog.ore
  if (!ore) throw new Error('Нет руды')
  const pricedCatalog: ItemCatalog = {
    ore: { ...ore, purchasePriceCopper: 25 },
  }
  const props = {
    catalog: pricedCatalog,
    itemLanguage: 'ru' as const,
    onOpenPlanner: vi.fn(),
  }
  const view = render(
    <ShoppingListPanel
      {...props}
      plan={calculateCraftPlan(pricedCatalog, [{ itemId: 'ore', quantity: 4 }])}
    />,
  )
  const toggle = screen.getByRole('button', { name: 'Развернуть список покупок' })
  expect(within(toggle).getByText('1')).toBeVisible()
  view.rerender(
    <ShoppingListPanel
      {...props}
      plan={calculateCraftPlan(pricedCatalog, [{ itemId: 'ore', quantity: 8 }])}
    />,
  )
  expect(within(toggle).getByText('2')).toBeVisible()
  view.rerender(
    <ShoppingListPanel {...props} plan={calculateCraftPlan(pricedCatalog, [])} />,
  )
  expect(screen.queryByRole('complementary', { name: 'Список покупок' })).toBeNull()
})
