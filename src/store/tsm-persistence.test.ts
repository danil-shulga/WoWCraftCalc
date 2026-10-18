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
  delete legacy.classicPricing
  expect(parseCurrentPersistedData(legacy).tbcPricing).toEqual({
    market: null,
    metric: 'recent',
    priceMode: 'individual',
  })
  expect(parseCurrentPersistedData(legacy).classicPricing).toEqual({
    market: null,
    metric: 'recent',
    priceMode: 'individual',
  })
})

it('сохраняет независимые настройки Classic и отклоняет рынок другой версии', () => {
  const data = createEmptyCraftData()
  data.activeVersion = 'classic'
  useCraftStore.getState().replaceData(data)
  const settings = {
    market: { version: 'classic', region: 'eu', realm: 'firemaw', faction: 'horde' },
    metric: 'marketValue',
    priceMode: 'tsm',
  } as const
  useCraftStore.getState().setPricing(settings)
  expect(useCraftStore.getState().tbcPricing).toEqual(data.tbcPricing)
  expect(parseImportedData(createExportJson(useCraftStore.getState()))).toMatchObject({
    success: true,
    data: { classicPricing: settings, tbcPricing: data.tbcPricing },
  })
  expect(
    JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as unknown,
  ).toMatchObject({ state: { classicPricing: settings } })
  expect(() => {
    useCraftStore.getState().setTbcPricing(settings)
  }).toThrow()
  expect(() => {
    useCraftStore.getState().setPricing({
      ...settings,
      market: { region: 'eu', realm: 'thunderstrike', faction: 'alliance' },
    })
  }).toThrow()
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
