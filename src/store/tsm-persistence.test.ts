import {
  createEmptyCraftData,
  createExportJson,
  parseCurrentPersistedData,
  parseImportedData,
  STORAGE_KEY,
} from './persistence'
import { useCraftStore } from './useCraftStore'

it('читает текущие данные без новых полей с defaults без смены версии', () => {
  const legacy: Partial<ReturnType<typeof createEmptyCraftData>> = createEmptyCraftData()
  delete legacy.tbcPricing
  expect(parseCurrentPersistedData(legacy).tbcPricing).toEqual({
    market: null,
    metric: 'recent',
    priceMode: 'individual',
  })
})
it('восстанавливает TBC-настройки и оба источника через storage и полный backup', async () => {
  const data = createEmptyCraftData()
  data.activeVersion = 'tbc'
  data.tbcPricing = {
    market: { region: 'us', realm: 'nightslayer', faction: 'horde' },
    metric: 'marketValue',
    priceMode: 'tsm',
  }
  data.workspaces.tbc.items.item = {
    id: 'item',
    name: 'Ткань',
    names: { ru: null, en: null },
    iconUrl: '',
    sections: ['reagents'],
    purchasePriceCopper: 0,
    salePriceCopper: 100,
    purchasePriceSource: 'tsm',
    salePriceSource: 'manual',
    recipe: null,
  }
  expect(useCraftStore.getState().replaceData(data)).toBeNull()
  const raw = createExportJson(useCraftStore.getState())
  expect(parseImportedData(raw)).toEqual({ success: true, data })
  expect(raw).not.toContain('scannedAt')
  const saved = localStorage.getItem(STORAGE_KEY)
  useCraftStore.getState().resetData()
  localStorage.setItem(STORAGE_KEY, saved ?? '')
  await useCraftStore.persist.rehydrate()
  expect(useCraftStore.getState().tbcPricing).toEqual(data.tbcPricing)
  useCraftStore.getState().setItemPrices('purchasePriceCopper', { item: 55 })
  expect(useCraftStore.getState().workspaces.tbc.items.item).toMatchObject({
    purchasePriceCopper: 55,
    purchasePriceSource: 'tsm',
  })
  const before = useCraftStore.getState()
  expect(
    before.replaceData({
      ...data,
      tbcPricing: {
        ...data.tbcPricing,
        market: { region: 'eu', realm: 'nightslayer', faction: 'horde' },
      },
    }),
  ).not.toBeNull()
  expect(useCraftStore.getState()).toBe(before)
})
