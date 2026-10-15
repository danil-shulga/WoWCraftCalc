import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../app/App'
import type { ItemCatalog } from '../domain/item.types'
import { testCraftData } from '../test/craft-state'
import { createExportJson, parseImportedData } from '../store/persistence'
import { useCraftStore } from '../store/useCraftStore'

const catalog: ItemCatalog = {
  ore: {
    id: 'ore',
    name: 'Руда',
    iconUrl: '',
    sections: ['reagents'],
    recipe: null,
    purchasePriceCopper: 10,
    salePriceCopper: null,
  },
  bar: {
    id: 'bar',
    name: 'Слиток',
    iconUrl: '',
    sections: ['reagents'],
    purchasePriceCopper: 50,
    salePriceCopper: 80,
    recipe: {
      outputQuantity: 2,
      profession: 'mining',
      reagents: [{ itemId: 'ore', quantity: 2, acquisition: 'buy' }],
    },
  },
  sword: {
    id: 'sword',
    name: 'Меч',
    iconUrl: '',
    sections: ['crafts'],
    isFavorite: true,
    purchasePriceCopper: null,
    salePriceCopper: 100,
    recipe: {
      outputQuantity: 3,
      profession: 'blacksmithing',
      reagents: [{ itemId: 'bar', quantity: 1, acquisition: 'craft' }],
    },
  },
}
beforeEach(() => {
  useCraftStore.getState().replaceData(testCraftData({ items: catalog }))
})

it.each([
  { name: 'Меч', heading: 'К изготовлению' },
  { name: 'Руда', heading: 'Дополнительные покупки' },
])(
  'анимирует добавление и удаление последней строки: $heading',
  async ({ name, heading }) => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Планировщик' }))
    await user.click(screen.getByRole('combobox', { name: 'Предмет для плана' }))
    await user.click(screen.getByRole('option', { name }))
    await user.click(screen.getByRole('button', { name: 'Добавить в план' }))
    const remove = screen.getByRole('button', { name: `Убрать из плана: ${name}` })
    const row = remove.closest('li')
    expect(row).toHaveClass('planner-page__animated-target')
    await user.click(remove)
    expect(useCraftStore.getState().workspaces.forever.planner?.targets).toEqual([])
    expect(row).toBeInTheDocument()
    expect(row).toHaveAttribute('data-removing', 'true')
    expect(row).toHaveAttribute('inert')
    expect(row).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('button', { name: `Убрать из плана: ${name}` })).toBeNull()
    fireEvent.animationEnd(remove)
    expect(row).toBeInTheDocument()
    if (!row) throw new Error('Не найдена строка цели')
    fireEvent.animationEnd(row)
    expect(row).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: heading })).toBeNull()
    expect(screen.getByText('План пока пуст')).toBeVisible()
  },
)

it.each([
  { itemId: 'bar', name: 'Слиток' },
  { itemId: 'ore', name: 'Руда' },
])(
  'сохраняет строки при очистке и повторном добавлении: $name',
  async ({ itemId, name }) => {
    const store = useCraftStore.getState()
    store.setPlannerQuantity('sword', 3)
    store.setPlannerQuantity(itemId, 2)
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Планировщик' }))
    const swordRow = screen
      .getByRole('button', { name: 'Убрать из плана: Меч' })
      .closest('li')
    const otherRow = screen
      .getByRole('button', { name: `Убрать из плана: ${name}` })
      .closest('li')
    act(() => {
      store.clearPlanner()
    })
    expect(swordRow).toHaveAttribute('data-removing', 'true')
    expect(otherRow).toHaveAttribute('data-removing', 'true')
    act(() => {
      store.setPlannerQuantity(itemId, 6)
    })
    expect(otherRow).not.toHaveAttribute('data-removing')
    expect(screen.getByRole('spinbutton', { name: `Количество: ${name}` })).toHaveValue(6)
    if (!swordRow || !otherRow) throw new Error('Не найдены строки целей')
    fireEvent.animationEnd(swordRow)
    fireEvent.animationEnd(otherRow)
    expect(otherRow).toBeInTheDocument()
    expect(swordRow).not.toBeInTheDocument()
  },
)

it('синхронизирует каталог, общую панель и страницу; показывает один список покупок', async () => {
  const user = userEvent.setup()
  render(<App />)
  expect(screen.queryByRole('complementary', { name: 'Список покупок' })).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Добавить в план: Меч' }))
  const panel = screen.getByRole('complementary', { name: 'Список покупок' })
  expect(within(panel).getByText('Руда')).not.toBeVisible()
  await user.click(
    within(panel).getByRole('button', { name: 'Развернуть список покупок' }),
  )
  expect(within(panel).getByText('Руда')).toBeVisible()
  expect(within(panel).getByText('× 2')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Открыть планировщик' }))
  expect(screen.getByRole('heading', { name: 'Планировщик' })).toBeVisible()
  expect(screen.queryByRole('complementary', { name: 'Список покупок' })).toBeNull()
  expect(screen.getAllByRole('heading', { name: 'Список покупок' })).toHaveLength(1)
  expect(screen.getByRole('heading', { name: 'Порядок крафта' })).toBeVisible()
  expect(
    screen.getByText('Порядок крафта').nextElementSibling?.firstElementChild,
  ).toHaveTextContent('Слиток')
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Количество: Меч' }), {
    target: { value: '4' },
  })
  expect(screen.getByText(/Всего партий: 2; выход: 6; остаток: 2/)).toBeVisible()
  for (const name of ['Избранное', 'Крафты', 'Выгодные']) {
    await user.click(screen.getByRole('button', { name: new RegExp('^' + name) }))
    expect(screen.getByRole('complementary', { name: 'Список покупок' })).toBeVisible()
    if (name !== 'Выгодные') expect(screen.getByRole('spinbutton')).toHaveValue(4)
  }
  await user.click(screen.getByRole('button', { name: 'Планировщик' }))
  await user.click(screen.getByRole('button', { name: 'Убрать из плана: Меч' }))
  expect(screen.getByText('План пока пуст')).toBeVisible()
  expect(useCraftStore.getState().workspaces.forever.items.sword).toBeDefined()
  await user.click(screen.getByRole('button', { name: 'Крафты' }))
  expect(screen.queryByRole('complementary', { name: 'Список покупок' })).toBeNull()
})

it('добавляет прямую покупку через селект; очищает план только после подтверждения', async () => {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('button', { name: 'Планировщик' }))
  await user.click(screen.getByRole('combobox', { name: 'Предмет для плана' }))
  await user.click(screen.getByRole('option', { name: 'Руда' }))
  await user.click(screen.getByRole('button', { name: 'Добавить в план' }))
  expect(screen.getByRole('heading', { name: 'Дополнительные покупки' })).toBeVisible()
  expect(screen.queryByText('Прибыль производства')).toBeNull()
  expect(screen.getByRole('spinbutton', { name: 'Количество: Руда' })).toHaveValue(1)
  await user.click(screen.getByRole('button', { name: 'Очистить план' }))
  await user.click(screen.getByRole('button', { name: 'Отмена' }))
  expect(screen.getByRole('spinbutton')).toHaveValue(1)
  await user.click(screen.getByRole('button', { name: 'Очистить план' }))
  await user.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Очистить',
    }),
  )
  expect(screen.getByText('План пока пуст')).toBeVisible()
  expect(Object.keys(useCraftStore.getState().workspaces.forever.items)).toHaveLength(3)
})

it('пересчитывает выход без изменения запроса, восстанавливает JSON и изолирует версии', async () => {
  const store = useCraftStore.getState()
  store.setPlannerQuantity('sword', 6)
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('button', { name: 'Планировщик' }))
  act(() => {
    store.setRecipe('sword', {
      outputQuantity: 5,
      profession: null,
      reagents: [{ itemId: 'bar', quantity: 1, acquisition: 'craft' }],
    })
  })
  expect(screen.getByRole('spinbutton')).toHaveValue(6)
  expect(screen.getByRole('spinbutton')).toHaveAttribute('step', '5')
  expect(screen.getByText(/Всего партий: 2; выход: 10; остаток: 4/)).toBeVisible()
  const restored = parseImportedData(createExportJson(useCraftStore.getState()))
  if (!restored.success) throw new Error(restored.error)
  act(() => {
    store.setActiveVersion('tbc')
  })
  expect(screen.getByText('План пока пуст')).toBeVisible()
  act(() => {
    store.setActiveVersion('forever')
    store.clearPlanner()
  })
  expect(screen.getByText('План пока пуст')).toBeVisible()
  act(() => {
    store.replaceData(restored.data)
  })
  expect(screen.getByRole('spinbutton')).toHaveValue(6)
  act(() => {
    store.setRecipe('sword', null)
  })
  expect(screen.getByRole('heading', { name: 'Дополнительные покупки' })).toBeVisible()
  expect(screen.getByRole('spinbutton')).toHaveValue(6)
})
