import {
  createCatalogCalculationSnapshot,
  getCraftUnitCost,
  getProfitPerCraft,
  getRecipeBatchCost,
} from './calculations'
import { recipeWouldCreateCycle } from './recipe-validation'
import type { Item, ItemCatalog } from './item.types'

function makeItem(item: Partial<Item> & Pick<Item, 'id' | 'name'>): Item {
  return {
    iconUrl: '',
    sections: ['reagents'],
    purchasePriceCopper: null,
    salePriceCopper: null,
    recipe: null,
    ...item,
  }
}

describe('craft calculations', () => {
  const catalog: ItemCatalog = {
    ore: makeItem({
      id: 'ore',
      name: 'Руда',
      purchasePriceCopper: 100,
    }),
    bar: makeItem({
      id: 'bar',
      name: 'Слиток',
      purchasePriceCopper: 250,
      recipe: {
        outputQuantity: 2,
        profession: null,
        reagents: [{ itemId: 'ore', quantity: 2, acquisition: 'buy' }],
      },
    }),
    sword: makeItem({
      id: 'sword',
      name: 'Меч',
      sections: ['crafts'],
      salePriceCopper: 1_000,
      recipe: {
        outputQuantity: 1,
        profession: null,
        reagents: [{ itemId: 'bar', quantity: 3, acquisition: 'craft' }],
      },
    }),
  }

  it('учитывает количество результата вложенного рецепта', () => {
    expect(getCraftUnitCost(catalog, 'bar')).toBe(100)
    expect(getRecipeBatchCost(catalog, 'sword')).toBe(300)
    expect(getProfitPerCraft(catalog, 'sword')).toBe(700)
  })

  it('не накапливает округление при расчёте всей партии', () => {
    const fractionalCatalog: ItemCatalog = {
      dust: makeItem({
        id: 'dust',
        name: 'Пыль',
        purchasePriceCopper: 1,
      }),
      thread: makeItem({
        id: 'thread',
        name: 'Нить',
        recipe: {
          outputQuantity: 2,
          profession: null,
          reagents: [{ itemId: 'dust', quantity: 1, acquisition: 'buy' }],
        },
      }),
    }

    expect(getCraftUnitCost(fractionalCatalog, 'thread')).toBe(1)
    expect(getRecipeBatchCost(fractionalCatalog, 'thread')).toBe(1)
  })

  it('использует выбранный способ получения реагента', () => {
    const sword = catalog.sword

    if (sword?.recipe === undefined || sword.recipe === null) {
      throw new Error('Test fixture is invalid')
    }

    const catalogWithPurchase: ItemCatalog = {
      ...catalog,
      sword: {
        ...sword,
        recipe: {
          ...sword.recipe,
          reagents: [{ itemId: 'bar', quantity: 3, acquisition: 'buy' }],
        },
      },
    }

    expect(getRecipeBatchCost(catalogWithPurchase, 'sword')).toBe(750)
  })

  it('автоматически учитывает профессии во всей цепочке и сравнивает сценарии', () => {
    const professionCatalog: ItemCatalog = {
      ore: makeItem({
        id: 'ore',
        name: 'Руда',
        purchasePriceCopper: 100,
      }),
      bar: makeItem({
        id: 'bar',
        name: 'Слиток',
        purchasePriceCopper: 300,
        recipe: {
          outputQuantity: 2,
          profession: 'mining',
          reagents: [{ itemId: 'ore', quantity: 2, acquisition: 'auto' }],
        },
      }),
      hide: makeItem({
        id: 'hide',
        name: 'Шкура',
        purchasePriceCopper: 50,
      }),
      leather: makeItem({
        id: 'leather',
        name: 'Кожа',
        purchasePriceCopper: 400,
        recipe: {
          outputQuantity: 1,
          profession: 'leatherworking',
          reagents: [{ itemId: 'hide', quantity: 1, acquisition: 'auto' }],
        },
      }),
      device: makeItem({
        id: 'device',
        name: 'Устройство',
        salePriceCopper: 2_000,
        recipe: {
          outputQuantity: 1,
          profession: 'engineering',
          reagents: [
            { itemId: 'bar', quantity: 2, acquisition: 'auto' },
            { itemId: 'leather', quantity: 1, acquisition: 'auto' },
          ],
        },
      }),
    }

    expect(
      getProfitPerCraft(professionCatalog, 'device', {
        ownedProfessions: new Set(['mining']),
      }),
    ).toBe(1_400)
    expect(
      getProfitPerCraft(professionCatalog, 'device', {
        scenario: 'all-professions',
      }),
    ).toBe(1_750)
    expect(
      getProfitPerCraft(professionCatalog, 'device', {
        scenario: 'buy-reagents',
      }),
    ).toBe(1_000)
  })

  it('ручной выбор имеет приоритет, а рецепт без профессии автоматически покупается', () => {
    const automaticCatalog: ItemCatalog = {
      material: makeItem({
        id: 'material',
        name: 'Материал',
        purchasePriceCopper: 100,
      }),
      component: makeItem({
        id: 'component',
        name: 'Компонент',
        purchasePriceCopper: 500,
        recipe: {
          outputQuantity: 1,
          profession: null,
          reagents: [{ itemId: 'material', quantity: 1, acquisition: 'auto' }],
        },
      }),
      product: makeItem({
        id: 'product',
        name: 'Изделие',
        salePriceCopper: 1_000,
        recipe: {
          outputQuantity: 1,
          profession: 'engineering',
          reagents: [{ itemId: 'component', quantity: 1, acquisition: 'auto' }],
        },
      }),
    }

    expect(
      getProfitPerCraft(automaticCatalog, 'product', {
        ownedProfessions: new Set(['engineering']),
      }),
    ).toBe(500)

    const product = automaticCatalog.product

    if (product?.recipe === undefined || product.recipe === null) {
      throw new Error('Test fixture is invalid')
    }

    const overriddenCatalog: ItemCatalog = {
      ...automaticCatalog,
      product: {
        ...product,
        recipe: {
          ...product.recipe,
          reagents: [{ itemId: 'component', quantity: 1, acquisition: 'craft' }],
        },
      },
    }

    expect(getProfitPerCraft(overriddenCatalog, 'product')).toBe(900)
  })

  it('останавливает расчёт повреждённого циклического рецепта', () => {
    const cyclicCatalog: ItemCatalog = {
      first: makeItem({
        id: 'first',
        name: 'Первый',
        recipe: {
          outputQuantity: 1,
          profession: null,
          reagents: [{ itemId: 'second', quantity: 1, acquisition: 'craft' }],
        },
      }),
      second: makeItem({
        id: 'second',
        name: 'Второй',
        recipe: {
          outputQuantity: 1,
          profession: null,
          reagents: [{ itemId: 'first', quantity: 1, acquisition: 'craft' }],
        },
      }),
    }

    expect(getCraftUnitCost(cyclicCatalog, 'first')).toBeNull()
  })

  it('не считает пустой повреждённый рецепт бесплатным', () => {
    const emptyRecipeCatalog: ItemCatalog = {
      product: makeItem({
        id: 'product',
        name: 'Изделие',
        salePriceCopper: 100,
        recipe: {
          outputQuantity: 1,
          profession: null,
          reagents: [],
        },
      }),
    }

    expect(getCraftUnitCost(emptyRecipeCatalog, 'product')).toBeNull()
    expect(getProfitPerCraft(emptyRecipeCatalog, 'product')).toBeNull()
  })

  it('строит единый снимок для стоимости и сценариев прибыли', () => {
    const snapshot = createCatalogCalculationSnapshot(
      catalog,
      new Set(),
      new Set(['sword']),
    )

    expect(snapshot.bar).toMatchObject({
      craftUnitCost: 100,
      selectedUnitCosts: {
        auto: 250,
        buy: 250,
        craft: 100,
      },
      automaticMethod: 'buy',
    })
    expect(snapshot.sword).toMatchObject({
      configuredProfit: 700,
      allProfessionsProfit: 250,
      boughtReagentsProfit: 250,
    })
    expect(snapshot.bar?.configuredProfit).toBeNull()
  })
})

describe('recipe validation', () => {
  it('обнаруживает косвенный цикл до сохранения', () => {
    const catalog: ItemCatalog = {
      first: makeItem({
        id: 'first',
        name: 'Первый',
      }),
      second: makeItem({
        id: 'second',
        name: 'Второй',
        recipe: {
          outputQuantity: 1,
          profession: null,
          reagents: [{ itemId: 'first', quantity: 1, acquisition: 'craft' }],
        },
      }),
    }

    expect(
      recipeWouldCreateCycle(catalog, 'first', [
        { itemId: 'second', quantity: 1, acquisition: 'craft' },
      ]),
    ).toBe(true)
  })
})
