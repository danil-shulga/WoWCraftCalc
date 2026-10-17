import { act, fireEvent, render, screen, within } from '@testing-library/react'
import * as calculations from '../domain/calculations'
import * as disenchanting from '../domain/disenchanting-catalog'
import { DEFAULT_TSM_SETTINGS, tsmMarketKey } from '../domain/tsm'
import { useTsmStore } from '../features/tsm/tsm-client'
import { useCraftStore } from '../store/useCraftStore'
import { createPerformanceCatalog } from '../test/performance-catalog'
import { testCraftData } from '../test/craft-state'
import { ItemsPage } from './ItemsPage'

beforeEach(() => {
  useTsmStore.setState({ scope: null, snapshot: null })
})
afterEach(() => {
  vi.restoreAllMocks()
})

it.each(['crafts', 'reagents', 'favorites', 'disenchanting'] as const)(
  'не пересчитывает %s при поиске, языке, перестановке и количестве плана',
  (section) => {
    const catalog = createPerformanceCatalog(3)
    for (const item of Object.values(catalog)) {
      if (item.id !== 'material') {
        item.sections = ['crafts', 'reagents', 'disenchanting']
        item.isFavorite = true
      }
    }
    useCraftStore.getState().replaceData(testCraftData({ items: catalog }))
    const snapshot = vi.spyOn(calculations, 'createCatalogCalculationSnapshot')
    const disenchant = vi.spyOn(disenchanting, 'createCatalogDisenchantSnapshot')
    render(<ItemsPage section={section} />)
    const search = screen.getByRole('searchbox')
    for (const query of ['Test product 000', 'zz-no-match', 'Test product', ''])
      fireEvent.change(search, { target: { value: query } })
    expect(screen.getByText('Test product 000')).toBeVisible()
    expect(snapshot).toHaveBeenCalledTimes(1)
    expect(disenchant).toHaveBeenCalledTimes(section === 'disenchanting' ? 1 : 0)
    act(() => {
      useCraftStore.getState().setItemLanguage('en')
    })
    act(() => {
      useCraftStore
        .getState()
        .moveRootItem(section, 'product-002', 'product-000', 'before')
    })
    act(() => {
      useCraftStore.getState().setPlannerQuantity('product-000', 5)
    })
    expect(screen.getByRole('spinbutton')).toHaveValue(5)
    expect(
      screen.getAllByRole('button', { name: /^Редактировать Test product/ })[0],
    ).toHaveAccessibleName('Редактировать Test product 002')
    expect(snapshot).toHaveBeenCalledTimes(1)
    expect(disenchant).toHaveBeenCalledTimes(section === 'disenchanting' ? 1 : 0)
  },
)

it('обновляет стоимость при активном поиске после правок каталога, профессий и цен TSM', () => {
  const catalog = createPerformanceCatalog(3)
  const material = catalog.material
  if (!material) throw new Error('Нет материала')
  catalog.raw = {
    ...material,
    id: 'raw',
    name: 'Сырьё',
    purchasePriceCopper: 5,
    source: { wowheadItemId: 2770, wowheadVersion: 'tbc' },
  }
  material.recipe = {
    profession: 'mining',
    outputQuantity: 1,
    reagents: [{ itemId: 'raw', quantity: 2, acquisition: 'buy' }],
  }
  for (const item of Object.values(catalog)) {
    if (item.id.startsWith('product-') && item.recipe)
      item.recipe.reagents[0] = { itemId: 'material', quantity: 3, acquisition: 'auto' }
  }
  useCraftStore
    .getState()
    .replaceData(
      testCraftData({ items: catalog, ownedProfessions: ['tailoring'] }, 'tbc'),
    )
  const snapshot = vi.spyOn(calculations, 'createCatalogCalculationSnapshot')
  render(<ItemsPage section="crafts" />)
  const search = screen.getByRole('searchbox')
  fireEvent.change(search, { target: { value: 'Test product 000' } })
  const cost = () => {
    const row = screen.getByText('Test product 000').closest('article')
    if (!row) throw new Error('Нет строки')
    return (
      within(row)
        .getByText('Крафт')
        .nextElementSibling?.querySelector('.money-display__part > span') ?? null
    )
  }
  expect(cost()).toHaveTextContent(/^15$/)
  const change = (action: () => void, expected: number) => {
    const before = snapshot.mock.calls.length
    act(action)
    expect(snapshot).toHaveBeenCalledTimes(before + 1)
    expect(search).toHaveValue('Test product 000')
    expect(cost()).toHaveTextContent(new RegExp(`^${String(expected)}$`))
  }
  change(() => {
    useCraftStore.getState().setItemPrice('material', 'purchasePriceCopper', 20)
  }, 30)
  change(() => {
    useCraftStore.getState().setProfessionOwned('mining', true)
  }, 15)
  change(() => {
    useCraftStore.getState().setRecipe('product-000', {
      profession: 'tailoring',
      outputQuantity: 1,
      reagents: [{ itemId: 'material', quantity: 2, acquisition: 'auto' }],
    })
  }, 20)
  change(() => {
    useCraftStore.getState().setAcquisition('product-000', 'material', 'buy')
  }, 40)
  change(() => {
    useCraftStore.getState().setAcquisition('product-000', 'material', 'craft')
  }, 20)
  change(() => {
    useCraftStore.getState().setRecipe('material', {
      profession: 'mining',
      outputQuantity: 2,
      reagents: [{ itemId: 'raw', quantity: 2, acquisition: 'buy' }],
    })
  }, 10)
  const market = { region: 'eu', realm: 'thunderstrike', faction: 'alliance' } as const
  change(() => {
    useCraftStore
      .getState()
      .setTbcPricing({ ...DEFAULT_TSM_SETTINGS, market, priceMode: 'tsm' })
  }, 10)
  change(() => {
    useTsmStore.setState({
      scope: `${String(useCraftStore.getState().workspaceRevision)}:${tsmMarketKey(market)}`,
      snapshot: {
        schemaVersion: 1,
        market,
        scannedAt: '2026-10-17T12:00:00Z',
        items: { '2770': { recent: 20, marketValue: 2 } },
      },
    })
  }, 40)
  change(() => {
    useCraftStore.getState().setTbcPricing({
      ...DEFAULT_TSM_SETTINGS,
      market,
      priceMode: 'tsm',
      metric: 'marketValue',
    })
  }, 4)
  change(() => {
    useCraftStore.getState().setTbcPricing({ ...DEFAULT_TSM_SETTINGS, market })
  }, 10)
  change(() => {
    useCraftStore.getState().setTbcPricing({
      ...DEFAULT_TSM_SETTINGS,
      market: { ...market, faction: 'horde' },
      priceMode: 'tsm',
    })
  }, 10)
})
