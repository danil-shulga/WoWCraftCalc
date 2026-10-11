import {
  createCatalogCalculationSnapshot,
  getCraftUnitCost,
  getProfitPerCraft,
  getRecipeBatchCost,
  getTotalAcquisitionProfit,
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

  it('не округляет выгоду единицы до расчёта суммарной экономии', () => {
    const fractionalCatalog: ItemCatalog = {
      dust: makeItem({
        id: 'dust',
        name: 'Пыль',
        purchasePriceCopper: 1,
      }),
      thread: makeItem({
        id: 'thread',
        name: 'Нить',
        purchasePriceCopper: 1,
        salePriceCopper: 1,
        recipe: {
          outputQuantity: 2,
          profession: 'tailoring',
          reagents: [{ itemId: 'dust', quantity: 1, acquisition: 'buy' }],
        },
      }),
    }
    const snapshot = createCatalogCalculationSnapshot(
      fractionalCatalog,
      new Set(['tailoring']),
      new Set(['thread']),
    )
    const profits = snapshot.thread?.exactSelectedUnitProfits

    expect(profits).toEqual({ auto: 0.5, buy: -0.5, craft: 0.5 })
    expect(getTotalAcquisitionProfit(profits?.craft ?? null, 2)).toBe(1)
    expect(getTotalAcquisitionProfit(profits?.buy ?? null, 2)).toBe(-1)
    expect(getTotalAcquisitionProfit(profits?.auto ?? null, 2)).toBe(1)
    expect(snapshot.thread?.configuredProfit).toBe(1)
    expect(getProfitPerCraft(fractionalCatalog, 'thread')).toBe(1)
  })

  it.each([
    [0.5, 1, 1],
    [0.5, 2, 1],
    [0.5, 3, 2],
    [0.5, 5, 3],
    [-0.5, 2, -1],
    [-0.5, 3, -1],
    [-0.5, 5, -2],
    [150, 3, 450],
    [-150, 3, -450],
    [0, 3, 0],
    [null, 3, null],
  ])('округляет итоговую выгоду %s × %s до %s', (profit, quantity, expected) => {
    expect(getTotalAcquisitionProfit(profit, quantity)).toBe(expected)
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

  it('автоматически покупает реагент, если доступный крафт дороже', () => {
    const expensiveCraftCatalog: ItemCatalog = {
      material: makeItem({
        id: 'material',
        name: 'Материал',
        purchasePriceCopper: 8_290,
      }),
      component: makeItem({
        id: 'component',
        name: 'Компонент',
        purchasePriceCopper: 2_800,
        recipe: {
          outputQuantity: 1,
          profession: 'engineering',
          reagents: [{ itemId: 'material', quantity: 1, acquisition: 'buy' }],
        },
      }),
    }

    const snapshot = createCatalogCalculationSnapshot(
      expensiveCraftCatalog,
      new Set(['engineering']),
      new Set(),
    )

    expect(snapshot.component).toMatchObject({
      automaticMethod: 'buy',
      exactSelectedUnitProfits: {
        auto: 5_490,
        buy: 5_490,
        craft: -5_490,
      },
    })
    expect(getTotalAcquisitionProfit(5_490, 5)).toBe(27_450)
    expect(getTotalAcquisitionProfit(null, 5)).toBeNull()
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
      exactSelectedUnitProfits: {
        auto: -150,
        buy: -150,
        craft: 150,
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
