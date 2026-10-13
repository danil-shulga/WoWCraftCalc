import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../app/App'
import { ItemsPage } from '../../pages/ItemsPage'
import { useCraftStore } from '../../store/useCraftStore'
import { createEmptyCraftData } from '../../store/persistence'
import { useTsmStore } from './tsm-client'
import type { Item } from '../../domain/item.types'

const market = { region: 'eu', realm: 'thunderstrike', faction: 'alliance' } as const
const item: Item = {
  id: 'cloth',
  name: 'Ткань',
  names: { ru: 'Ткань', en: null },
  sections: ['reagents'],
  iconUrl: '',
  source: { wowheadItemId: 21877, wowheadVersion: 'tbc' },
  purchasePriceCopper: 55,
  salePriceCopper: 77,
  recipe: null,
}
beforeEach(() => {
  const data = createEmptyCraftData()
  data.activeVersion = 'tbc'
  data.tbcPricing.market = market
  data.workspaces.tbc.items = { cloth: item }
  useCraftStore.getState().replaceData(data)
  useTsmStore.setState({
    scope: `${String(useCraftStore.getState().workspaceRevision)}:tbc-eu-thunderstrike-alliance`,
    snapshot: {
      schemaVersion: 1,
      market,
      scannedAt: '2026-01-01T00:00:00Z',
      items: { '21877': { recent: 2322, marketValue: 1708 } },
    },
    status: 'ready',
    error: null,
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('отмена сохраняет источники и суммы, сохранение применяет независимые источники и возвращает фокус', async () => {
  const user = userEvent.setup()
  render(<ItemsPage section="reagents" />)
  const opener = screen.getByRole('button', { name: 'Редактировать Ткань' })
  await user.click(opener)
  await user.click(
    screen.getByRole('checkbox', {
      name: 'Использовать цену TSM: Цена покупки за единицу',
    }),
  )
  const purchase = screen.getByRole('group', { name: 'Цена покупки за единицу' })
  expect(within(purchase).getByLabelText('медь')).toBeDisabled()
  expect(within(purchase).getByLabelText('медь')).toHaveValue(55)
  expect(
    within(screen.getByRole('group', { name: 'Цена продажи за единицу' })).getByLabelText(
      'медь',
    ),
  ).toBeEnabled()
  await user.click(screen.getByRole('button', { name: 'Отмена' }))
  expect(useCraftStore.getState().workspaces.tbc.items.cloth).toEqual(item)
  expect(opener).toHaveFocus()
  await user.click(opener)
  await user.click(
    screen.getByRole('checkbox', {
      name: 'Использовать цену TSM: Цена продажи за единицу',
    }),
  )
  await user.click(screen.getByRole('button', { name: 'Сохранить' }))
  expect(useCraftStore.getState().workspaces.tbc.items.cloth).toMatchObject({
    purchasePriceCopper: 55,
    salePriceCopper: 77,
    salePriceSource: 'tsm',
  })
})
it('все по TSM охватывает покупку/продажу, массовое редактирование меняет ручную сумму', async () => {
  const user = userEvent.setup()
  render(<ItemsPage section="reagents" />)
  await user.click(screen.getByRole('radio', { name: 'Все по TSM' }))
  const before = useCraftStore.getState().workspaces.tbc.items.cloth
  expect(before).toEqual(item)
  const row = screen.getByText('Ткань').closest('article')
  if (!row) throw new Error('Нет строки')
  expect(within(row).getAllByText('23')).toHaveLength(2)
  await user.click(screen.getByRole('button', { name: 'Редактировать цены' }))
  fireEvent.change(screen.getByLabelText('Ручная цена покупки: Ткань, медь'), {
    target: { value: '99' },
  })
  expect(screen.getByText('Используется TSM:')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Сохранить все' }))
  expect(useCraftStore.getState().workspaces.tbc.items.cloth).toMatchObject({
    purchasePriceCopper: 99,
    salePriceCopper: 77,
  })
  await user.click(screen.getByRole('radio', { name: 'Основные цены' }))
  expect(within(row).getByText('99')).toBeVisible()
})
it('без ID объясняет недоступность, чужой рынок не показывает цену', async () => {
  const user = userEvent.setup()
  act(() => {
    useCraftStore.getState().updateItem(item.id, { ...item, source: undefined })
  })
  render(<ItemsPage section="reagents" />)
  await user.click(screen.getByRole('button', { name: 'Редактировать Ткань' }))
  expect(
    screen.getAllByText('TSM недоступен: у предмета нет игрового ID TBC.'),
  ).toHaveLength(2)
  expect(
    screen.getByRole('checkbox', {
      name: 'Использовать цену TSM: Цена покупки за единицу',
    }),
  ).toBeDisabled()
})
it('настройки ищут мир, сохраняют общий показатель, Tab/Escape работают с порталом и возвращают фокус', async () => {
  const user = userEvent.setup()
  act(() => {
    useCraftStore
      .getState()
      .setTbcPricing({ market: null, metric: 'recent', priceMode: 'individual' })
  })
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          schemaVersion: 1,
          generatedAt: '2026-01-01T00:00:00Z',
          markets: [],
        }),
      ),
    ),
  )
  render(<App />)
  const opener = screen.getByRole('button', { name: 'Настройки' })
  await user.click(opener)
  expect(screen.getByRole('button', { name: 'Проверить обновление' })).toBeDisabled()
  const world = screen.getByRole('combobox', { name: 'Игровой мир TSM' })
  await user.type(world, 'spine')
  await user.click(screen.getByRole('option', { name: 'Spineshatter' }))
  expect(useCraftStore.getState().tbcPricing.market?.realm).toBe('spineshatter')
  await user.click(screen.getByRole('radio', { name: 'Рыночная цена' }))
  expect(useCraftStore.getState().tbcPricing.metric).toBe('marketValue')
  await user.click(world)
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  expect(screen.getByRole('dialog')).toBeVisible()
  await user.tab()
  expect(screen.getByRole('combobox', { name: 'Фракция TSM' })).toHaveFocus()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(opener).toHaveFocus()
})
