import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../app/App'
import { ItemsPage } from '../../pages/ItemsPage'
import { PlannerPage } from '../../pages/PlannerPage'
import { usePlanner } from '../planner/usePlanner'
import { ShoppingList } from '../planner/ShoppingList'
import { useCraftStore } from '../../store/useCraftStore'
import { createEmptyCraftData } from '../../store/persistence'
import { useTsmStore } from './tsm-client'
import { TsmSettingsSection } from './TsmSettingsSection'
import type { Item } from '../../domain/item.types'

describe.each(['tbc', 'classic'] as const)('TSM в %s', (gameVersion) => {
  const pricingField = gameVersion === 'classic' ? 'classicPricing' : 'tbcPricing'
  const market =
    gameVersion === 'classic'
      ? ({
          version: 'classic',
          region: 'eu',
          realm: 'firemaw',
          faction: 'alliance',
        } as const)
      : ({ region: 'eu', realm: 'thunderstrike', faction: 'alliance' } as const)
  const item: Item = {
    id: 'cloth',
    name: 'Ткань',
    names: { ru: 'Ткань', en: null },
    sections: ['reagents'],
    iconUrl: '',
    source: { wowheadItemId: 21877, wowheadVersion: gameVersion },
    purchasePriceCopper: 55,
    salePriceCopper: 77,
    recipe: null,
  }
  beforeEach(() => {
    const data = createEmptyCraftData()
    data.activeVersion = gameVersion
    data[pricingField].market = market
    data.workspaces[gameVersion].items = { cloth: item }
    useCraftStore.getState().replaceData(data)
    useTsmStore.setState({
      scope: `${String(useCraftStore.getState().workspaceRevision)}:${gameVersion}-eu-${market.realm}-alliance`,
      snapshot: {
        schemaVersion: 1,
        market,
        scannedAt: gameVersion === 'classic' ? null : '2026-01-01T00:00:00Z',
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

  if (gameVersion === 'classic') {
    it('показывает неизвестную свежесть Era без выдуманной даты', () => {
      render(
        <TsmSettingsSection
          gameVersion="classic"
          settings={useCraftStore.getState().classicPricing}
          onChange={vi.fn()}
          onCheck={vi.fn()}
        />,
      )
      expect(screen.getByText('Последний опубликованный снимок загружен.')).toBeVisible()
      expect(
        screen.getByText(/время сканирования неизвестно; свежесть цен не подтверждена/),
      ).toBeVisible()
      expect(screen.queryByText(/устарел/)).not.toBeInTheDocument()
      expect(document.querySelector('time')).toBeNull()
    })
  }

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
      within(
        screen.getByRole('group', { name: 'Цена продажи за единицу' }),
      ).getByLabelText('медь'),
    ).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(useCraftStore.getState().workspaces[gameVersion].items.cloth).toEqual(item)
    expect(opener).toHaveFocus()
    await user.click(opener)
    await user.click(
      screen.getByRole('checkbox', {
        name: 'Использовать цену TSM: Цена продажи за единицу',
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(useCraftStore.getState().workspaces[gameVersion].items.cloth).toMatchObject({
      purchasePriceCopper: 55,
      salePriceCopper: 77,
      salePriceSource: 'tsm',
    })
  })
  it('все по TSM охватывает покупку/продажу, массовое редактирование меняет ручную сумму', async () => {
    const user = userEvent.setup()
    render(<ItemsPage section="reagents" />)
    await user.click(screen.getByRole('radio', { name: 'TSM' }))
    const before = useCraftStore.getState().workspaces[gameVersion].items.cloth
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
    expect(useCraftStore.getState().workspaces[gameVersion].items.cloth).toMatchObject({
      purchasePriceCopper: 99,
      salePriceCopper: 77,
    })
    await user.click(screen.getByRole('radio', { name: 'Заданные' }))
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
      screen.getAllByText(
        `TSM недоступен: у предмета нет игрового ID ${gameVersion === 'classic' ? 'Classic' : 'TBC'}.`,
      ),
    ).toHaveLength(2)
    expect(
      screen.getByRole('checkbox', {
        name: 'Использовать цену TSM: Цена покупки за единицу',
      }),
    ).toBeDisabled()
  })

  it('показывает ручную подстановку без пометки TSM в каталоге и закупке', async () => {
    const user = userEvent.setup()
    useTsmStore.setState({ snapshot: null })
    useCraftStore.getState().setPlannerQuantity('cloth', 1)
    const view = render(<ItemsPage section="reagents" />)
    expect(screen.getByRole('group', { name: 'Приоритетные цены' })).toBeVisible()
    await user.click(screen.getByRole('radio', { name: 'TSM' }))
    expect(screen.getByText('55')).toBeVisible()
    expect(screen.getByText('77')).toBeVisible()
    expect(screen.queryByTitle('Цена TSM')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Редактировать цены' }))
    fireEvent.change(screen.getByLabelText('Цена покупки: Ткань, медь'), {
      target: { value: '99' },
    })
    expect(screen.queryByText('Используется TSM:')).not.toBeInTheDocument()
    expect(useCraftStore.getState().workspaces[gameVersion].items.cloth).toEqual(item)
    await user.click(screen.getByRole('button', { name: 'Сохранить все' }))
    expect(screen.getByText('99')).toBeVisible()
    function Purchases() {
      return (
        <ShoppingList plan={usePlanner()} catalog={{ cloth: item }} itemLanguage="ru" />
      )
    }
    view.rerender(<Purchases />)
    expect(screen.getByText('За штуку')).toBeVisible()
    expect(screen.queryByText('За штуку · TSM')).not.toBeInTheDocument()
    expect(screen.getAllByText('99').length).toBeGreaterThanOrEqual(2)
  })

  it('показывает подстановку TSM, отменяет ручной черновик и пересчитывает после сохранения', async () => {
    const user = userEvent.setup()
    const missing = { ...item, purchasePriceCopper: null }
    useCraftStore.getState().updateItem(item.id, missing)
    useCraftStore.getState().setPlannerQuantity('cloth', 1)
    const view = render(<ItemsPage section="reagents" />)
    expect(screen.getByRole('radio', { name: 'Заданные' })).toBeChecked()
    expect(screen.getByTitle('Цена TSM')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Редактировать цены' }))
    const copper = screen.getByLabelText('Ручная цена покупки: Ткань, медь')
    fireEvent.change(copper, { target: { value: '99' } })
    expect(screen.getByText('Используется TSM:')).toBeVisible()
    expect(useCraftStore.getState().workspaces[gameVersion].items.cloth).toEqual(missing)
    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(useCraftStore.getState().workspaces[gameVersion].items.cloth).toEqual(missing)
    function Purchases() {
      return (
        <ShoppingList
          plan={usePlanner()}
          catalog={{ cloth: missing }}
          itemLanguage="ru"
        />
      )
    }
    view.rerender(<Purchases />)
    expect(screen.getByText('За штуку · TSM')).toBeVisible()
    view.rerender(<ItemsPage section="reagents" />)
    await user.click(screen.getByRole('button', { name: 'Редактировать цены' }))
    fireEvent.change(screen.getByLabelText('Ручная цена покупки: Ткань, медь'), {
      target: { value: '1' },
    })
    fireEvent.change(screen.getByLabelText('Ручная цена покупки: Ткань, медь'), {
      target: { value: '0' },
    })
    await user.click(screen.getByRole('button', { name: 'Сохранить все' }))
    expect(screen.queryByTitle('Цена TSM')).not.toBeInTheDocument()
    expect(
      useCraftStore.getState().workspaces[gameVersion].items.cloth?.purchasePriceCopper,
    ).toBe(0)
    view.rerender(<Purchases />)
    expect(screen.getByText('За штуку')).toBeVisible()
    expect(screen.queryByText('За штуку · TSM')).not.toBeInTheDocument()
  })

  it('переключает приоритет клавиатурой без изменения каталога', async () => {
    const user = userEvent.setup()
    render(<ItemsPage section="reagents" />)
    screen.getByRole('radio', { name: 'Заданные' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio', { name: 'TSM' })).toBeChecked()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('radio', { name: 'Заданные' })).toBeChecked()
    expect(useCraftStore.getState().workspaces[gameVersion].items.cloth).toEqual(item)
  })
  it('настройки ищут мир, сохраняют общий показатель, Tab/Escape работают с порталом и возвращают фокус', async () => {
    const user = userEvent.setup()
    act(() => {
      useCraftStore
        .getState()
        .setPricing({ market: null, metric: 'recent', priceMode: 'individual' })
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
    await user.type(world, gameVersion === 'classic' ? 'Ashbringer' : 'spine')
    await user.click(
      screen.getByRole('option', {
        name: gameVersion === 'classic' ? /^Firemaw/ : 'Spineshatter',
      }),
    )
    expect(useCraftStore.getState()[pricingField].market?.realm).toBe(
      gameVersion === 'classic' ? 'firemaw' : 'spineshatter',
    )
    await user.click(screen.getByRole('radio', { name: 'Рыночная цена' }))
    expect(useCraftStore.getState()[pricingField].metric).toBe('marketValue')
    await user.click(world)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeVisible()
    await user.tab()
    const faction = screen.getByRole('combobox', { name: 'Фракция TSM' })
    expect(faction).toHaveFocus()
    expect(faction).toHaveAttribute('readonly')
    await user.click(screen.getByRole('option', { name: 'Орда' }))
    expect(useCraftStore.getState()[pricingField].market?.faction).toBe('horde')
    await user.click(faction)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeVisible()
    await user.click(screen.getByRole('combobox', { name: 'Регион TSM' }))
    await user.click(screen.getByRole('option', { name: 'Северная Америка' }))
    expect(useCraftStore.getState()[pricingField].market).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Игровой мир TSM' })).toHaveValue('')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('переключает цены бюджета в Планировщике и сохраняет выбор при переходе в каталог', async () => {
    const user = userEvent.setup()
    useCraftStore.getState().setPlannerQuantity('cloth', 1)
    function Planner() {
      const plan = usePlanner()
      return <PlannerPage plan={plan} catalog={{ cloth: item }} itemLanguage="ru" />
    }
    const view = render(<Planner />)
    const budget = screen.getByText('Бюджет').closest('div')
    if (!budget) throw new Error('Нет бюджета')
    expect(within(budget).getByText('55')).toBeVisible()
    await user.click(screen.getByRole('radio', { name: 'TSM' }))
    expect(within(budget).getByText('23')).toBeVisible()
    expect(within(budget).getByText('22')).toBeVisible()
    expect(useCraftStore.getState().workspaces[gameVersion].items.cloth).toEqual(item)
    view.rerender(<ItemsPage section="reagents" />)
    expect(screen.getByRole('radio', { name: 'TSM' })).toBeChecked()
    await user.click(screen.getByRole('radio', { name: 'Заданные' }))
    view.rerender(<Planner />)
    const restoredBudget = screen.getByText('Бюджет').closest('div')
    if (!restoredBudget) throw new Error('Нет бюджета')
    expect(within(restoredBudget).getByText('55')).toBeVisible()
  })
})
