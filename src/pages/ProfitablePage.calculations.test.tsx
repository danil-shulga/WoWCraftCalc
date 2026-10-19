import { requireValue } from '../test/require-value'
import { act, fireEvent, render, screen } from '@testing-library/react'
import * as profitability from '../domain/profitability'
import { useCraftStore } from '../store/useCraftStore'
import { useTsmStore } from '../features/tsm/tsm-client'
import { setupProfitabilityCatalog } from '../test/profitability-fixture'
import { ProfitablePage } from './ProfitablePage'
beforeEach(setupProfitabilityCatalog)
afterEach(() => vi.restoreAllMocks())
it('не повторяет расчёт рецептов при поиске, языке, сортировке и фоновом статусе', () => {
  const snapshot = vi.spyOn(profitability, 'createProfitabilitySnapshot')
  render(<ProfitablePage />)
  fireEvent.click(screen.getByRole('button', { name: 'Сортировать: Крафт' }))
  fireEvent.click(screen.getByRole('button', { name: 'Сортировать: Крафт' }))
  fireEvent.click(screen.getByRole('button', { name: 'Сортировать: Продажа' }))
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Bag' } })
  act(() => {
    useCraftStore.getState().setItemLanguage('en')
  })
  act(() => {
    useCraftStore.getState().setPlannerQuantity('bag', 2)
  })
  act(() => {
    useTsmStore.setState({ status: 'loading', loadedAt: Date.now() })
  })
  expect(snapshot).toHaveBeenCalledTimes(1)
  act(() => {
    useCraftStore.getState().setItemPrice('raw', 'purchasePriceCopper', 20000)
  })
  expect(snapshot).toHaveBeenCalledTimes(2)
})
it('обновляет цены по новому снимку при закрытых настройках', () => {
  act(() => {
    const state = useCraftStore.getState()
    state.setPricing({ ...state.tbcPricing, priceMode: 'tsm' })
  })
  render(<ProfitablePage />)
  expect(screen.getByRole('status')).toHaveTextContent('Показано: 2 из 2')
  act(() => {
    useTsmStore.setState((state) => ({
      snapshot: {
        ...requireValue(state.snapshot),
        items: {
          '21841': { recent: 1, marketValue: 1 },
          '21854': { recent: 1, marketValue: 1 },
        },
      },
    }))
  })
  expect(screen.getByRole('status')).toHaveTextContent('Показано: 2 из 2')
  expect(document.querySelectorAll('[data-negative]')).toHaveLength(2)
})
