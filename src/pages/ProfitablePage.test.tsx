import { requireValue } from '../test/require-value'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../app/App'
import { useCraftStore } from '../store/useCraftStore'
import { useTsmStore } from '../features/tsm/tsm-client'
import {
  setupProfitabilityCatalog,
  profitabilityCatalog,
} from '../test/profitability-fixture'
import { testCraftData } from '../test/craft-state'
import { tsmMarketKey } from '../domain/tsm'
import { ProfitablePage } from './ProfitablePage'

beforeEach(setupProfitabilityCatalog)
afterEach(() => vi.restoreAllMocks())

it('показывает все крафты без дублей, параметров и редакторов', () => {
  render(<ProfitablePage />)
  expect(screen.getByRole('status')).toHaveTextContent('Показано: 2 из 2')
  expect(screen.getAllByText('Сумка')).toHaveLength(1)
  expect(
    screen.queryByRole('button', { name: /Параметры|Добавить|Редактировать/ }),
  ).not.toBeInTheDocument()
  expect(screen.queryByRole('form')).not.toBeInTheDocument()
  expect(screen.getByText('За 1 предмет · комиссия 5%')).toBeVisible()
})

it('переключает вкладки Выгодных без анимации строк', async () => {
  const user = userEvent.setup()
  const view = render(<ProfitablePage />)
  expect(view.container.querySelector('[data-entering]')).toBeNull()
  for (const name of ['Покупка', 'Продажа', 'Распыление', 'Крафт и продажа']) {
    await user.click(screen.getByRole('button', { name }))
    expect(view.container.querySelector('[data-entering]')).toBeNull()
    expect(view.container.querySelector('[data-removing]')).toBeNull()
  }
})

it('оставляет отрицательную и нулевую прибыль в списке', () => {
  const state = useCraftStore.getState()
  state.setItemPrice('bag', 'salePriceCopper', 5000)
  state.setItemPrice('robe', 'salePriceCopper', 10000)
  state.setRecipe('robe', {
    outputQuantity: 20,
    profession: 'tailoring',
    reagents: [{ itemId: 'raw', quantity: 19, acquisition: 'buy' }],
  })
  render(<ProfitablePage />)
  expect(screen.getByRole('status')).toHaveTextContent('Показано: 2 из 2')
  const bag = screen.getByRole('row', { name: /Сумка/ })
  const robe = screen.getByRole('row', { name: /Длинное одеяние волшебника/ })
  expect(within(bag).getAllByRole('cell')[3]).toHaveAttribute('data-negative')
  expect(bag).toHaveTextContent('-52,5%')
  expect(bag).not.toHaveTextContent('+-')
  expect(within(robe).getAllByRole('cell')[3]).not.toHaveAttribute('data-positive')
  expect(robe).toHaveTextContent('0%')
})

it('сохраняет неизвестные оценки и рецепты невыбранной профессии', () => {
  useCraftStore.getState().setProfessionOwned('tailoring', false)
  useCraftStore.getState().setItemPrice('raw', 'purchasePriceCopper', null)
  render(<ProfitablePage />)
  expect(screen.getByRole('status')).toHaveTextContent('Показано: 2 из 2')
  expect(screen.getAllByRole('row')).toHaveLength(3)
  expect(screen.getAllByText('Не определена')).toHaveLength(2)
  expect(screen.getByText('Не удалось оценить: 2')).toBeVisible()
})

it('показывает все предметы покупки/продажи, включая неизвестные и обратное отклонение', async () => {
  const user = userEvent.setup()
  render(<ProfitablePage />)
  await user.click(screen.getByRole('button', { name: 'Покупка' }))
  expect(screen.getByRole('status')).toHaveTextContent('Показано: 3 из 3')
  expect(screen.getByRole('columnheader', { name: 'Потенц. прибыль' })).toBeVisible()
  expect(screen.getByText('+50%')).toBeVisible()
  expect(screen.getByText('-40%')).toBeVisible()
  const sortPercent = screen.getByRole('button', { name: 'Сортировать: Отклонение' })
  await user.click(sortPercent)
  expect(
    screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.getAttribute('data-item-id')),
  ).toEqual(['robe', 'bag', 'raw'])
  await user.click(sortPercent)
  expect(
    screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.getAttribute('data-item-id')),
  ).toEqual(['bag', 'robe', 'raw'])
  await user.click(screen.getByRole('button', { name: 'Продажа' }))
  expect(screen.getByRole('status')).toHaveTextContent('Показано: 3 из 3')
  expect(screen.getByRole('columnheader', { name: 'Потенц. прибыль' })).toBeVisible()
  const bag = screen.getByRole('row', { name: /Сумка/ })
  expect(within(bag).getAllByRole('cell')[3]).toHaveAttribute('data-negative')
  expect(screen.getByText('-40%')).toBeVisible()
})

it('ищет по английскому имени и сортирует заголовками', async () => {
  const user = userEvent.setup()
  render(<ProfitablePage />)
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: ' BAG ' } })
  expect(screen.getByRole('status')).toHaveTextContent('Показано: 1 из 2')
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } })
  expect(screen.queryByRole('combobox', { name: 'Сортировка' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Сортировать: Предмет' }))
  expect(screen.getAllByRole('row')[1]).toHaveTextContent('Длинное одеяние')
})

it.each(['Крафт и продажа', 'Покупка', 'Продажа'])(
  'переносит подписи сумм в подсказки: %s',
  async (mode) => {
    const user = userEvent.setup()
    render(<ProfitablePage />)
    await user.click(screen.getByRole('button', { name: mode }))
    const row = screen.getByRole('row', { name: /Сумка/ })
    expect(row.querySelector('.profitable-list__amount small')).toBeNull()
    const cells = within(row).getAllByRole('cell')
    const cost = requireValue(cells[1]?.querySelector('.tooltip-trigger'))
    await user.hover(cost)
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      mode === 'Крафт и продажа' ? 'Рецепт' : 'TSM',
    )
    await user.unhover(cost)
    fireEvent.blur(cost)
    const gain = requireValue(cells[3]?.querySelector('.tooltip-trigger'))
    fireEvent.focus(gain)
    expect(screen.getByRole('tooltip')).toHaveTextContent('После комиссии 5%')
    fireEvent.blur(gain)
  },
)

it('показывает и сортирует крафт распыления, прибыль считает от меньших затрат', async () => {
  const catalog = structuredClone(profitabilityCatalog)
  for (const id of ['bag', 'robe'] as const) {
    Object.assign(requireValue(catalog[id]), {
      sections: ['disenchanting'],
      qualityId: 2,
      itemLevel: 108,
      classId: 4,
      subclassId: 1,
      inventoryType: 8,
      purchasePriceCopper: 50_000,
    })
  }
  for (const [id, wowheadItemId] of [
    ['dust', 22445],
    ['essence', 22446],
    ['shard', 22449],
  ] as const) {
    catalog[id] = {
      ...requireValue(catalog.raw),
      id,
      name: id,
      source: { wowheadItemId },
      salePriceCopper: 100_000,
    }
  }
  useCraftStore.getState().replaceData(testCraftData({ items: catalog }, 'tbc'))
  const user = userEvent.setup()
  render(<ProfitablePage />)
  await user.click(screen.getByRole('button', { name: 'Распыление' }))
  expect(screen.getByRole('columnheader', { name: 'Крафт' })).toBeVisible()
  const row = screen.getByRole('row', { name: /Сумка/ })
  expect(row.querySelector('.profitable-list__amount small')).toBeNull()
  const cells = within(row).getAllByRole('cell')
  expect(cells).toHaveLength(6)
  expect(cells[2]).toHaveTextContent(/1.*золота/)
  expect(cells[4]).toHaveAttribute('data-positive')
  const gain = requireValue(cells[4]?.querySelector('.tooltip-trigger'))
  await user.hover(gain)
  expect(screen.getByRole('tooltip')).toHaveTextContent('меньшей из известных')
  await user.unhover(gain)
  fireEvent.blur(gain)
  fireEvent.focus(requireValue(cells[3]?.querySelector('.tooltip-trigger')))
  expect(screen.getByRole('tooltip')).toHaveTextContent('Результаты распыления')
  fireEvent.blur(requireValue(cells[3]?.querySelector('.tooltip-trigger')))
  const sort = screen.getByRole('button', { name: 'Сортировать: Крафт' })
  await user.click(sort)
  expect(screen.getAllByRole('row')[1]).toHaveTextContent('Длинное одеяние')
  await user.click(sort)
  expect(screen.getAllByRole('row')[1]).toHaveTextContent('Сумка')
})

it.each([
  ['Предмет', 'ascending', 'robe', 'bag'],
  ['Крафт', 'descending', 'robe', 'bag'],
  ['Продажа', 'descending', 'robe', 'bag'],
  ['Прибыль', 'ascending', 'bag', 'robe'],
  ['Доходность', 'descending', 'bag', 'robe'],
] as const)(
  'сортирует по заголовку %s в обоих направлениях',
  async (label, direction, first, second) => {
    const user = userEvent.setup()
    render(<ProfitablePage />)
    const button = screen.getByRole('button', { name: `Сортировать: ${label}` })
    const header = screen.getByRole('columnheader', { name: label })
    const order = () =>
      screen
        .getAllByRole('row')
        .slice(1)
        .map((row) => row.getAttribute('data-item-id'))
    await user.click(button)
    expect(order()).toEqual([first, second])
    expect(header).toHaveAttribute('aria-sort', direction)
    expect(
      screen
        .getAllByRole('columnheader')
        .filter((cell) => cell.hasAttribute('aria-sort')),
    ).toHaveLength(1)
    await user.keyboard('{Enter}')
    expect(order()).toEqual([second, first])
    expect(header).toHaveAttribute(
      'aria-sort',
      direction === 'ascending' ? 'descending' : 'ascending',
    )
    expect(button).toHaveFocus()
  },
)

it('оставляет неизвестную доходность последней при обоих направлениях', async () => {
  useCraftStore.getState().setRecipe('bag', {
    outputQuantity: 1,
    profession: null,
    reagents: [{ itemId: 'robe', quantity: 1, acquisition: 'buy' }],
  })
  useCraftStore.getState().setItemPrice('robe', 'purchasePriceCopper', 0)
  const user = userEvent.setup()
  render(<ProfitablePage />)
  const button = screen.getByRole('button', { name: 'Сортировать: Доходность' })
  for (let click = 0; click < 2; click += 1) {
    await user.click(button)
    expect(
      screen
        .getAllByRole('row')
        .slice(1)
        .map((row) => row.getAttribute('data-item-id')),
    ).toEqual(['robe', 'bag'])
  }
})

it('объясняет отсутствие кандидатов, неподдерживаемую версию и неизвестную свежесть Classic', async () => {
  const user = userEvent.setup()
  const data = testCraftData({ items: profitabilityCatalog }, 'classic')
  const market = {
    version: 'classic',
    region: 'eu',
    realm: 'firemaw',
    faction: 'alliance',
  } as const
  data.classicPricing.market = market
  useCraftStore.getState().replaceData(data)
  useTsmStore.setState((state) => ({
    scope: `${String(useCraftStore.getState().workspaceRevision)}:${tsmMarketKey(market)}`,
    snapshot: { ...requireValue(state.snapshot), market, scannedAt: null },
  }))
  render(<ProfitablePage />)
  expect(screen.getByText(/Время снимка неизвестно/)).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Распыление' }))
  expect(screen.getByText('Нет предметов для этого режима')).toBeVisible()
  act(() => {
    useCraftStore.getState().setActiveVersion('forever')
  })
  expect(screen.getByText(/Для Forever нет подтверждённой/)).toBeVisible()
})

it('открывается в App и не создаёт черновики параметров при смене версии', async () => {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('button', { name: 'Выгодные' }))
  expect(screen.getByRole('heading', { name: 'Выгодные' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: /Выбрать версию игры/ }))
  await user.click(screen.getByRole('button', { name: 'Classic' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(useCraftStore.getState().activeVersion).toBe('classic')
})
