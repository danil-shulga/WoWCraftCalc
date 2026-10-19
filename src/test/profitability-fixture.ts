import type { Item, ItemCatalog } from '../domain/item.types'
import { DEFAULT_TSM_SETTINGS, tsmMarketKey } from '../domain/tsm'
import { useTsmStore } from '../features/tsm/tsm-client'
import { useCraftStore, usePersistenceStatusStore } from '../store/useCraftStore'
import { testCraftData } from './craft-state'

export const profitabilityMarket = {
  region: 'eu',
  realm: 'thunderstrike',
  faction: 'alliance',
} as const
const item = (id: string, patch: Partial<Item>): Item => ({
  id,
  name: id,
  iconUrl: '',
  sections: ['reagents'],
  recipe: null,
  purchasePriceCopper: null,
  salePriceCopper: null,
  ...patch,
})
export const profitabilityCatalog: ItemCatalog = {
  raw: item('raw', { name: 'Ткань', purchasePriceCopper: 10_000 }),
  bag: item('bag', {
    name: 'Сумка',
    names: { ru: 'Сумка', en: 'Bag' },
    source: { wowheadItemId: 21841 },
    sections: ['crafts', 'reagents'],
    salePriceCopper: 30_000,
    recipe: {
      profession: 'tailoring',
      outputQuantity: 1,
      reagents: [{ itemId: 'raw', quantity: 1, acquisition: 'buy' }],
    },
  }),
  robe: item('robe', {
    name: 'Длинное одеяние волшебника',
    source: { wowheadItemId: 21854 },
    sections: ['crafts'],
    salePriceCopper: 50_000,
    recipe: {
      profession: 'tailoring',
      outputQuantity: 1,
      reagents: [{ itemId: 'raw', quantity: 2, acquisition: 'buy' }],
    },
  }),
}
export function setupProfitabilityCatalog() {
  usePersistenceStatusStore.setState({ hydrationError: null, recoveryRequired: false })
  const data = testCraftData(
    { items: structuredClone(profitabilityCatalog), ownedProfessions: ['tailoring'] },
    'tbc',
  )
  data.tbcPricing = { ...DEFAULT_TSM_SETTINGS, market: profitabilityMarket }
  useCraftStore.getState().replaceData(data)
  useTsmStore.setState({
    scope: `${String(useCraftStore.getState().workspaceRevision)}:${tsmMarketKey(profitabilityMarket)}`,
    snapshot: {
      schemaVersion: 1,
      market: profitabilityMarket,
      scannedAt: '2026-10-19T00:00:00Z',
      items: {
        '21841': { recent: 30_000, marketValue: 50_000 },
        '21854': { recent: 60_000, marketValue: 40_000 },
      },
    },
    status: 'ready',
    error: null,
  })
}
