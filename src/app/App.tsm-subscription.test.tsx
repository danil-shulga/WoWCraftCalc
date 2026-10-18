import { Profiler } from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'

import { App } from './App'
import { createEmptyCraftData } from '../store/persistence'
import { useCraftStore } from '../store/useCraftStore'
import { useTsmStore } from '../features/tsm/tsm-client'
import type * as TsmClientModule from '../features/tsm/tsm-client'
import type * as SidebarModule from '../components/navigation/Sidebar/Sidebar'

const renderSidebar = vi.hoisted(() => vi.fn())
vi.mock('../components/navigation/Sidebar/Sidebar', async (importOriginal) => {
  const original = await importOriginal<typeof SidebarModule>()
  return {
    ...original,
    Sidebar: (props: React.ComponentProps<typeof original.Sidebar>) => {
      renderSidebar()
      return <original.Sidebar {...props} />
    },
  }
})
vi.mock('../features/tsm/tsm-client', async (importOriginal) => ({
  ...(await importOriginal<typeof TsmClientModule>()),
  startTsmClient: () => undefined,
}))

describe.each(['tbc', 'classic'] as const)('подписки TSM в %s', (gameVersion) => {
  const pricingField = gameVersion === 'classic' ? 'classicPricing' : 'tbcPricing'
  beforeEach(() => {
    const data = createEmptyCraftData()
    data.activeVersion = gameVersion
    data[pricingField].market = {
      region: 'eu',
      realm: gameVersion === 'classic' ? 'firemaw' : 'thunderstrike',
      ...(gameVersion === 'classic' ? { version: 'classic' as const } : {}),
      faction: 'alliance',
    }
    useCraftStore.getState().replaceData(data)
    useTsmStore.setState({
      scope: null,
      snapshot: null,
      status: 'idle',
      error: null,
      cacheError: null,
      loadedAt: null,
    })
  })

  it.each([false, true])(
    'статусы TSM обновляют только открытый блок настроек: %s',
    (open) => {
      const commits = vi.fn()
      render(
        <Profiler id="App" onRender={commits}>
          <App />
        </Profiler>,
      )
      if (open) fireEvent.click(screen.getByRole('button', { name: 'Настройки' }))
      renderSidebar.mockClear()
      commits.mockClear()
      for (let i = 0; i < 20; i++) {
        act(() => {
          useTsmStore.setState({
            status: i % 2 === 0 ? 'loading' : 'error',
            error: i % 2 === 0 ? null : `Ошибка проверки ${String(i)}`,
            loadedAt: i,
          })
        })
        if (open) {
          expect(
            screen.getByText(
              i % 2 === 0 ? 'Проверяем обновление…' : `Ошибка проверки ${String(i)}`,
            ),
          ).toBeVisible()
        }
      }
      expect(renderSidebar).toHaveBeenCalledTimes(0)
      if (open) expect(commits.mock.calls.length).toBeGreaterThanOrEqual(20)
      else expect(commits).not.toHaveBeenCalled()
    },
  )

  it('новый снимок обновляет бюджет при закрытых настройках', () => {
    const data = createEmptyCraftData()
    data.activeVersion = gameVersion
    data[pricingField] = useCraftStore.getState()[pricingField]
    data.workspaces[gameVersion].items = {
      cloth: {
        id: 'cloth',
        name: 'Ткань',
        iconUrl: '',
        sections: ['crafts'],
        source: { wowheadItemId: 21877, wowheadVersion: gameVersion },
        purchasePriceCopper: 55,
        salePriceCopper: null,
        purchasePriceSource: 'tsm',
        recipe: null,
      },
    }
    useCraftStore.getState().replaceData(data)
    useCraftStore.getState().setPlannerQuantity('cloth', 1)
    render(<App />)
    const budget = within(
      screen.getByRole('button', { name: 'Развернуть список покупок' }),
    )
    expect(budget.getByText('55')).toBeVisible()
    act(() => {
      useTsmStore.setState({
        scope: `${String(useCraftStore.getState().workspaceRevision)}:${gameVersion}-eu-${gameVersion === 'classic' ? 'firemaw' : 'thunderstrike'}-alliance`,
        snapshot: {
          schemaVersion: 1,
          market: {
            region: 'eu',
            realm: gameVersion === 'classic' ? 'firemaw' : 'thunderstrike',
            ...(gameVersion === 'classic' ? { version: 'classic' as const } : {}),
            faction: 'alliance',
          },
          scannedAt: '2026-01-01T00:00:00Z',
          items: { '21877': { recent: 99, marketValue: 88 } },
        },
      })
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(budget.getByText('99')).toBeVisible()
  })
})
