import type { Item, ItemCatalog } from '../domain/item.types'

export function createPerformanceCatalog(productCount = 100): ItemCatalog {
  const catalog: ItemCatalog = {
    material: {
      id: 'material',
      name: 'Общий материал',
      iconUrl: '',
      sections: ['reagents'],
      purchasePriceCopper: 10,
      salePriceCopper: null,
      recipe: null,
    },
  }
  for (let index = 0; index < productCount; index++) {
    const id = `product-${String(index).padStart(3, '0')}`
    const item: Item = {
      id,
      name: `Тестовый предмет ${String(index).padStart(3, '0')} с длинным названием`,
      names: { ru: null, en: `Test product ${String(index).padStart(3, '0')}` },
      iconUrl: '',
      sections: ['crafts'],
      purchasePriceCopper: 100,
      salePriceCopper: 200,
      recipe: {
        profession: 'tailoring',
        outputQuantity: 2,
        reagents: [{ itemId: 'material', quantity: 3, acquisition: 'buy' }],
      },
    }
    catalog[id] = item
  }
  return catalog
}
