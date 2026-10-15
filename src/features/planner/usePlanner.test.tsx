import { act, render, screen } from '@testing-library/react'
import { usePlanner } from './usePlanner'
import { useCraftStore } from '../../store/useCraftStore'
import { useTsmStore } from '../tsm/tsm-client'
import { createEmptyCraftData } from '../../store/persistence'

function Harness() {
  const plan = usePlanner()
  return (
    <>
      <output aria-label="Бюджет">{plan.budget ?? 'неизвестно'}</output>
      <output aria-label="Покупки">
        {plan.purchases
          .map((line) => `${line.itemId}:${String(line.quantity)}`)
          .join(',')}
      </output>
    </>
  )
}

it('пересчитывается при смене профессии, individual/TSM, снимка и рынка', () => {
  const market = { region: 'eu', realm: 'thunderstrike', faction: 'alliance' } as const
  const data = createEmptyCraftData()
  data.activeVersion = 'tbc'
  data.tbcPricing.market = market
  data.workspaces.tbc.items = {
    ore: {
      id: 'ore',
      name: 'Руда',
      iconUrl: '',
      sections: ['reagents'],
      recipe: null,
      purchasePriceCopper: 10,
      salePriceCopper: null,
      source: { wowheadItemId: 1 },
    },
    bar: {
      id: 'bar',
      name: 'Слиток',
      iconUrl: '',
      sections: ['reagents'],
      purchasePriceCopper: 50,
      salePriceCopper: 80,
      source: { wowheadItemId: 2 },
      recipe: {
        outputQuantity: 2,
        profession: 'mining',
        reagents: [{ itemId: 'ore', quantity: 1, acquisition: 'buy' }],
      },
    },
    sword: {
      id: 'sword',
      name: 'Меч',
      iconUrl: '',
      sections: ['crafts'],
      purchasePriceCopper: 90,
      salePriceCopper: 100,
      recipe: {
        outputQuantity: 1,
        profession: null,
        reagents: [{ itemId: 'bar', quantity: 1, acquisition: 'auto' }],
      },
    },
  }
  const store = useCraftStore.getState()
  store.replaceData(data)
  store.setPlannerQuantity('sword', 1)
  render(<Harness />)
  expect(screen.getByLabelText('Бюджет')).toHaveTextContent('50')
  act(() => {
    store.setProfessionOwned('mining', true)
  })
  expect(screen.getByLabelText('Покупки')).toHaveTextContent('ore:1')
  expect(screen.getByLabelText('Бюджет')).toHaveTextContent('10')
  act(() => {
    store.setTbcPricing({ ...data.tbcPricing, priceMode: 'tsm' })
  })
  expect(screen.getByLabelText('Бюджет')).toHaveTextContent('неизвестно')
  const snapshot = {
    schemaVersion: 1 as const,
    market,
    scannedAt: '2026-10-15T00:00:00Z',
    items: { '1': { recent: 20, marketValue: 30 }, '2': { recent: 5, marketValue: 50 } },
  }
  act(() => {
    useTsmStore.setState({
      scope: `${String(useCraftStore.getState().workspaceRevision)}:tbc-eu-thunderstrike-alliance`,
      snapshot,
    })
  })
  expect(screen.getByLabelText('Покупки')).toHaveTextContent('bar:1')
  expect(screen.getByLabelText('Бюджет')).toHaveTextContent('5')
  act(() => {
    useTsmStore.setState({
      snapshot: {
        ...snapshot,
        items: { ...snapshot.items, '2': { recent: 100, marketValue: 100 } },
      },
    })
  })
  expect(screen.getByLabelText('Покупки')).toHaveTextContent('ore:1')
  expect(screen.getByLabelText('Бюджет')).toHaveTextContent('20')
  act(() => {
    store.setTbcPricing({
      ...data.tbcPricing,
      priceMode: 'tsm',
      market: { ...market, faction: 'horde' },
    })
  })
  expect(screen.getByLabelText('Бюджет')).toHaveTextContent('неизвестно')
})
