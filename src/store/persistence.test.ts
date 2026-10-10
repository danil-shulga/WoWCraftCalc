import type { ItemCatalog } from '../domain/item.types'
import { createExportJson, parseImportedData } from './persistence'

const catalog: ItemCatalog = {
  cloth: {
    id: 'cloth',
    name: 'Ткань',
    iconUrl: '',
    sections: ['reagents'],
    purchasePriceCopper: 42,
    salePriceCopper: null,
    recipe: null,
  },
  bolt: {
    id: 'bolt',
    name: 'Рулон ткани',
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
  it('восстанавливает экспортированный каталог', () => {
    const result = parseImportedData(createExportJson(catalog))

    expect(result.success).toBe(true)

    if (result.success) {
      expect(result.items).toEqual(catalog)
    }
  })

  it('отклоняет произвольный JSON', () => {
    const result = parseImportedData('{"items": []}')

    expect(result.success).toBe(false)
  })

  it('добавляет пустую профессию рецептам из старого экспорта', () => {
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
      expect(result.items.product?.recipe?.profession).toBeNull()
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

    const result = parseImportedData(createExportJson(invalidCatalog))

    expect(result.success).toBe(false)
  })
})
