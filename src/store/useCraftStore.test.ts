import { persistedCraftDataSchema } from '../domain/item.schema'
import type { ItemCatalog } from '../domain/item.types'
import { useCraftStore, usePersistenceStatusStore } from './useCraftStore'

describe('настройки CraftStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useCraftStore.getState().replaceData({
      items: {},
      ownedProfessions: [],
      currencyDisplay: 'icons',
    })
    usePersistenceStatusStore.getState().setHydrationError(null)
  })

  it('использует иконки для сохранённых данных без настройки валют', () => {
    const parsed = persistedCraftDataSchema.parse({
      items: {},
      ownedProfessions: [],
    })

    expect(parsed.currencyDisplay).toBe('icons')
  })

  it('сохраняет выбранное отображение валют', () => {
    useCraftStore.getState().setCurrencyDisplay('text')

    const persisted = JSON.parse(localStorage.getItem('craft-calc-data') ?? '{}') as {
      state?: { currencyDisplay?: string }
    }

    expect(useCraftStore.getState().currencyDisplay).toBe('text')
    expect(persisted.state?.currencyDisplay).toBe('text')
  })
})

describe('целостность CraftStore', () => {
  const linkedCatalog: ItemCatalog = {
    reagent: {
      id: 'reagent',
      name: 'Реагент',
      iconUrl: '',
      sections: ['reagents'],
      purchasePriceCopper: 10,
      salePriceCopper: null,
      recipe: null,
    },
    product: {
      id: 'product',
      name: 'Изделие',
      iconUrl: '',
      sections: ['crafts'],
      purchasePriceCopper: null,
      salePriceCopper: 100,
      recipe: {
        outputQuantity: 1,
        profession: null,
        reagents: [{ itemId: 'reagent', quantity: 1, acquisition: 'buy' }],
      },
    },
  }

  beforeEach(() => {
    localStorage.clear()
    useCraftStore.getState().replaceData({
      items: linkedCatalog,
      ownedProfessions: [],
      currencyDisplay: 'icons',
    })
    usePersistenceStatusStore.getState().setHydrationError(null)
  })

  it('не сохраняет пустой рецепт', () => {
    const error = useCraftStore.getState().setRecipe('product', {
      outputQuantity: 1,
      profession: null,
      reagents: [],
    })

    expect(error).toBe('Добавьте хотя бы один реагент')
    expect(useCraftStore.getState().items.product?.recipe).not.toBeNull()
  })

  it('удаляет рецепт, если вместе с предметом исчез последний реагент', () => {
    useCraftStore.getState().removeItem('reagent')

    expect(useCraftStore.getState().items.product?.recipe).toBeNull()
  })

  it('сохраняет текущее состояние и сообщает об ошибке hydration', async () => {
    localStorage.setItem(
      'craft-calc-data',
      JSON.stringify({
        version: 4,
        state: {
          items: {
            product: {
              ...linkedCatalog.product,
              recipe: {
                outputQuantity: 1,
                profession: null,
                reagents: [{ itemId: 'missing', quantity: 1, acquisition: 'buy' }],
              },
            },
          },
          ownedProfessions: [],
          currencyDisplay: 'icons',
        },
      }),
    )

    await useCraftStore.persist.rehydrate()

    expect(useCraftStore.getState().items).toEqual(linkedCatalog)
    expect(usePersistenceStatusStore.getState().hydrationError).toContain(
      'Один из реагентов отсутствует в каталоге',
    )
  })
})
