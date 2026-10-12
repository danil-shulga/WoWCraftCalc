import type { ItemCatalog } from '../domain/item.types'
import { testCraftData } from '../test/craft-state'
import {
  createExportJson,
  parseCurrentPersistedData,
  parseImportedData,
  createEmptyCraftData,
} from './persistence'

const catalog: ItemCatalog = {
  cloth: {
    id: 'cloth',
    name: 'Ткань',
    names: { ru: null, en: null },
    iconUrl: '',
    sections: ['reagents'],
    purchasePriceCopper: 42,
    salePriceCopper: null,
    recipe: null,
  },
  bolt: {
    id: 'bolt',
    name: 'Рулон ткани',
    names: { ru: null, en: null },
    iconUrl: '',
    sections: ['crafts'],
    purchasePriceCopper: null,
    salePriceCopper: 100,
    recipe: {
      outputQuantity: 1,
      profession: 'tailoring',
      reagents: [{ itemId: 'cloth', quantity: 2, acquisition: 'buy' }],
    },
  },
}

const cloth = catalog.cloth
const bolt = catalog.bolt
if (!cloth || !bolt) throw new Error('Нет фикстуры')

describe('резервная копия трёх версий', () => {
  it('восстанавливает все каталоги, версии, язык и валюту', () => {
    const data = testCraftData({
      items: catalog,
      ownedProfessions: ['tailoring'],
      currencyDisplay: 'text',
      itemLanguage: 'en',
    })
    data.activeVersion = 'tbc'
    data.workspaces.tbc = {
      items: { ...catalog, cloth: { ...cloth, purchasePriceCopper: 99 } },
      ownedProfessions: ['jewelcrafting'],
    }
    data.workspaces.classic = { items: catalog, ownedProfessions: ['mining'] }
    const raw = createExportJson(data)
    expect(raw).toContain('"format": "craftcalc-versioned-backup"')
    expect(parseImportedData(raw)).toEqual({ success: true, data })
  })
  it.each([1, 2, 3, 4])('отклоняет старый экспорт v%s', (version) => {
    expect(
      parseImportedData(
        JSON.stringify({
          version,
          exportedAt: '',
          items: catalog,
          data: { items: catalog },
        }),
      ),
    ).toMatchObject({
      success: false,
    })
  })
  it.each(['forever', 'tbc', 'classic'] as const)(
    'проверяет граф %s до применения',
    (version) => {
      const data = createEmptyCraftData()
      data.workspaces[version].items = { bolt: bolt }
      expect(() => parseCurrentPersistedData(data)).toThrow(
        'Один из реагентов отсутствует',
      )
      const raw = JSON.stringify({
        format: 'craftcalc-versioned-backup',
        version: 1,
        exportedAt: '',
        data,
      })
      expect(parseImportedData(raw).success).toBe(false)
    },
  )
  it('отклоняет циклы, чужое происхождение и недоступную профессию', () => {
    const data = testCraftData({ items: catalog })
    data.workspaces.forever.items.cloth = {
      ...cloth,
      source: { wowheadItemId: 1, wowheadVersion: 'classic' },
    }
    expect(() => parseCurrentPersistedData(data)).toThrow('другой версии')
    data.workspaces.forever.items = catalog
    data.workspaces.forever.ownedProfessions = ['jewelcrafting']
    expect(() => parseCurrentPersistedData(data)).toThrow('недоступная профессия')
    data.workspaces.forever.ownedProfessions = []
    data.workspaces.forever.items = {
      ...catalog,
      cloth: {
        ...cloth,
        recipe: {
          outputQuantity: 1,
          profession: null,
          reagents: [{ itemId: 'bolt', quantity: 1, acquisition: 'buy' }],
        },
      },
    }
    expect(() => parseCurrentPersistedData(data)).toThrow('циклическую')
  })
  it('различает неизвестную цену и ноль и разрешает источник без версии', () => {
    const data = testCraftData({
      items: {
        ...catalog,
        cloth: {
          ...cloth,
          purchasePriceCopper: 0,
          source: { wowheadItemId: 4306 },
        },
      },
    })
    expect(parseImportedData(createExportJson(data))).toEqual({ success: true, data })
  })
  it('сообщает об ошибке JSON и обязательных полей нового формата', () => {
    expect(parseImportedData('{broken')).toMatchObject({ success: false })
    expect(() => parseCurrentPersistedData({ items: {} })).toThrow('текущему формату')
  })
})
