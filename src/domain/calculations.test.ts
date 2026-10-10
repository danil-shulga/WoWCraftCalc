import { getCraftUnitCost, getProfitPerCraft, getRecipeBatchCost } from './calculations'
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
