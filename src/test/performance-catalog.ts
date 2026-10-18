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

export function createTreePerformanceCatalog(productCount: number, depth = 3, width = 3) {
  const catalog = createPerformanceCatalog(productCount)
  for (const item of Object.values(catalog)) {
    item.sections = item.id === 'material' ? ['crafts'] : ['crafts', 'reagents']
    item.isFavorite = item.id !== 'material'
    if (item.recipe) {
      item.names = { ru: item.name, en: item.names?.en ?? null }
      item.recipe.reagents = [{ itemId: 'branch-0', quantity: 2, acquisition: 'auto' }]
    }
  }
  for (let level = 0; level < depth; level++) {
    const id = `branch-${String(level)}`
    const reagents = Array.from({ length: width }, (_, index) => {
      const materialId = `material-${String(index)}`
      catalog[materialId] = {
        id: materialId,
        name: `Длинное название общего материала ${String(index)}`,
        names: { ru: null, en: `Shared material ${String(index)}` },
        iconUrl: '',
        sections: ['crafts'],
        purchasePriceCopper: 12345,
        salePriceCopper: 23456,
        recipe: null,
      }
      return { itemId: materialId, quantity: 2, acquisition: 'buy' as const }
    })
    catalog[id] = {
      id,
      name: `Промежуточный реагент с длинным названием ${String(level)}`,
      iconUrl: '',
      sections: ['crafts'],
      purchasePriceCopper: 10000,
      salePriceCopper: 20000,
      recipe: {
        profession: null,
        outputQuantity: 1,
        reagents: [
          ...reagents,
          ...(level + 1 < depth
            ? [
                {
                  itemId: `branch-${String(level + 1)}`,
                  quantity: 1,
                  acquisition: 'auto' as const,
                },
              ]
            : []),
        ],
      },
    }
  }
  return catalog
}
