import type { ItemCatalog, PersistedCraftData } from '../domain/item.types'
import {
  createExportJson,
  migratePersistedData,
  parseCurrentPersistedData,
  parseImportedData,
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

describe('JSON data transfer', () => {
  const persistedData: PersistedCraftData = {
    items: catalog,
    ownedProfessions: ['tailoring'],
    currencyDisplay: 'text',
    itemLanguage: 'ru',
  }

  it('восстанавливает каталог и настройки из полной резервной копии', () => {
    const exportedJson = createExportJson(persistedData)
    const result = parseImportedData(exportedJson)

    expect(exportedJson).toContain('"version": 4')
    expect(result.success).toBe(true)

    if (result.success) {
      expect(result.data).toEqual(persistedData)
    }
  })

  it('отклоняет произвольный JSON', () => {
    const result = parseImportedData('{"items": []}')

    expect(result.success).toBe(false)
  })

  it.each([undefined, { wowheadItemId: 4306 }])(
    'сохраняет необязательный источник предмета при восстановлении и экспорте: %j',
    (source) => {
      const data = {
        ...persistedData,
        items: Object.fromEntries(
          Object.entries(catalog).map(([itemId, item]) => [itemId, { ...item, source }]),
        ),
      }

      const restored = parseCurrentPersistedData(data)
      const imported = parseImportedData(createExportJson(restored))

      expect(restored.items.cloth?.source).toEqual(source)
      expect(imported.success).toBe(true)

      if (imported.success) {
        expect(imported.data.items.cloth?.source).toEqual(source)
        expect(imported.data.items.bolt?.recipe).toEqual(catalog.bolt?.recipe)
      }
    },
  )

  it('отклоняет источник предмета с некорректным Wowhead ID', () => {
    expect(() =>
      parseCurrentPersistedData({
        ...persistedData,
        items: Object.fromEntries(
          Object.entries(catalog).map(([itemId, item]) => [
            itemId,
            { ...item, source: { wowheadItemId: 0 } },
          ]),
        ),
      }),
    ).toThrow('Сохранённые данные не соответствуют текущему формату CraftCalc')
  })

  it('преобразует пустой рецепт из старого экспорта в отсутствие рецепта', () => {
    const oldExport = JSON.stringify({
      version: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      items: {
        product: {
          id: 'product',
          name: 'Предмет',
          iconUrl: '',
          sections: ['crafts'],
          purchasePriceCopper: null,
          salePriceCopper: 100,
          recipe: {
            outputQuantity: 1,
            reagents: [],
          },
        },
      },
    })

    const result = parseImportedData(oldExport)

    expect(result.success).toBe(true)

    if (result.success) {
      expect(result.data.items.product?.recipe).toBeNull()
      expect(result.data.ownedProfessions).toEqual([])
      expect(result.data.currencyDisplay).toBe('icons')
    }
  })

  it('переводит способы получения из экспорта v1 в автоматический режим', () => {
    const result = parseImportedData(
      JSON.stringify({
        version: 1,
        exportedAt: '2026-01-01T00:00:00.000Z',
        items: catalog,
      }),
    )

    expect(result.success).toBe(true)

    if (result.success) {
      expect(result.data.items.bolt?.recipe?.reagents[0]?.acquisition).toBe('auto')
    }
  })

  it('отклоняет ссылку на отсутствующий предмет', () => {
    const invalidCatalog: ItemCatalog = {
      product: {
        id: 'product',
        name: 'Предмет',
        iconUrl: '',
        sections: ['crafts'],
        purchasePriceCopper: null,
        salePriceCopper: 100,
        recipe: {
          outputQuantity: 1,
          profession: null,
          reagents: [{ itemId: 'missing', quantity: 1, acquisition: 'buy' }],
        },
      },
    }

    const result = parseImportedData(
      createExportJson({ ...persistedData, items: invalidCatalog }),
    )

    expect(result.success).toBe(false)
  })
})

describe('persist migrations', () => {
  it('использует выбранный язык названия в сообщении о повреждённом каталоге', () => {
    const cloth = catalog.cloth
    if (cloth === undefined) throw new Error('Нет тестового предмета')
    expect(() =>
      parseCurrentPersistedData({
        items: { cloth: { ...cloth, id: 'wrong', names: { ru: 'Ткань', en: 'Cloth' } } },
        itemLanguage: 'en',
      }),
    ).toThrow('Идентификатор предмета «Cloth» повреждён')
  })

  it('сохраняет исходное имя v4 без угадывания языка и задаёт RU по умолчанию', () => {
    const migrated = migratePersistedData(
      {
        items: { cloth: { ...catalog.cloth, name: 'Custom name', names: undefined } },
        ownedProfessions: ['tailoring'],
        currencyDisplay: 'text',
      },
      4,
    )
    expect(migrated.items.cloth).toMatchObject({
      name: 'Custom name',
      names: { ru: null, en: null },
      purchasePriceCopper: 42,
    })
    expect(migrated.itemLanguage).toBe('ru')
  })

  it('переносит оба названия и язык отображения через резервную копию', () => {
    const cloth = catalog.cloth
    if (cloth === undefined) throw new Error('Нет тестового предмета')
    const data = {
      items: { cloth: { ...cloth, names: { ru: 'Ткань', en: 'Cloth' } } },
      ownedProfessions: [],
      currencyDisplay: 'icons' as const,
      itemLanguage: 'en' as const,
    }
    expect(parseImportedData(createExportJson(data))).toEqual({ success: true, data })
    expect(
      parseImportedData(
        JSON.stringify({
          version: 3,
          exportedAt: '',
          data: { ...data, itemLanguage: undefined },
        }),
      ),
    ).toMatchObject({ success: true, data: { itemLanguage: 'ru' } })
  })

  it('преобразует состояние v3 и сохраняет пользовательские настройки', () => {
    const migrated = migratePersistedData(
      {
        items: {
          draft: {
            id: 'draft',
            name: 'Черновик',
            iconUrl: '',
            sections: ['crafts'],
            purchasePriceCopper: null,
            salePriceCopper: null,
            recipe: {
              outputQuantity: 1,
              profession: null,
              reagents: [],
            },
          },
        },
        ownedProfessions: ['mining'],
        currencyDisplay: 'text',
      },
      3,
    )

    expect(migrated.items.draft?.recipe).toBeNull()
    expect(migrated.ownedProfessions).toEqual(['mining'])
    expect(migrated.currencyDisplay).toBe('text')
  })

  it('отклоняет повреждённый граф при обычной hydration', () => {
    expect(() =>
      parseCurrentPersistedData({
        items: {
          product: {
            id: 'product',
            name: 'Предмет',
            iconUrl: '',
            sections: ['crafts'],
            purchasePriceCopper: null,
            salePriceCopper: null,
            recipe: {
              outputQuantity: 1,
              profession: null,
              reagents: [{ itemId: 'missing', quantity: 1, acquisition: 'buy' }],
            },
          },
        },
        ownedProfessions: [],
        currencyDisplay: 'icons',
      }),
    ).toThrow('Один из реагентов отсутствует в каталоге')
  })
})
