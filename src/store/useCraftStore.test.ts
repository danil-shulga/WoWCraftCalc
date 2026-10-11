import { persistedCraftDataSchema } from '../domain/item.schema'
import { getAutomaticAcquisitionMethod, getCraftUnitCost } from '../domain/calculations'
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

  it('атомарно обновляет рецепт Wowhead без дублей и сохраняет локальные данные', () => {
    const catalogWithImportedItems: ItemCatalog = {
      scraps: {
        id: 'scraps',
        name: 'Обрывки ткани',
        iconUrl: '',
        sections: ['reagents'],
        purchasePriceCopper: 1,
        salePriceCopper: null,
        recipe: null,
      },
      silk: {
        id: 'silk',
        name: 'Старое название рулона',
        iconUrl: 'https://example.com/old.jpg',
        source: { wowheadItemId: 4305 },
        sections: ['crafts', 'reagents'],
        purchasePriceCopper: 42,
        salePriceCopper: null,
        recipe: {
          outputQuantity: 1,
          profession: 'tailoring',
          reagents: [{ itemId: 'scraps', quantity: 3, acquisition: 'buy' }],
        },
      },
      boots: {
        id: 'boots',
        name: 'Старое название сапог',
        iconUrl: '',
        source: { wowheadItemId: 4320 },
        sections: ['crafts'],
        purchasePriceCopper: null,
        salePriceCopper: 979,
        recipe: {
          outputQuantity: 2,
          profession: 'tailoring',
          reagents: [{ itemId: 'silk', quantity: 1, acquisition: 'buy' }],
        },
      },
    }
    useCraftStore.getState().replaceData({
      items: catalogWithImportedItems,
      ownedProfessions: [],
      currencyDisplay: 'icons',
    })

    const importData = {
      outputQuantity: 2,
      profession: 'tailoring' as const,
      product: {
        wowheadItemId: 4320,
        name: 'Сапоги из паучьего шелка',
        iconUrl: 'https://example.com/boots.jpg',
      },
      reagents: [
        {
          wowheadItemId: 4305,
          name: 'Рулон шелка',
          iconUrl: 'https://example.com/silk.jpg',
          quantity: 2,
        },
        {
          wowheadItemId: 2319,
          name: 'Жесткая кожа',
          iconUrl: 'https://example.com/leather.jpg',
          quantity: 4,
        },
      ],
    }

    const firstResult = useCraftStore.getState().importRecipe(importData)
    const firstItems = useCraftStore.getState().items
    const leather = Object.values(firstItems).find(
      (item) => item.source?.wowheadItemId === 2319,
    )

    expect(firstResult).toMatchObject({
      success: true,
      productCreated: false,
      reagentsCreated: 1,
    })
    expect(firstItems.silk?.purchasePriceCopper).toBe(42)
    expect(firstItems.silk?.recipe).toEqual(catalogWithImportedItems.silk?.recipe)
    expect(firstItems.boots?.salePriceCopper).toBe(979)
    expect(firstItems.boots?.recipe).toMatchObject({
      outputQuantity: 2,
      profession: 'tailoring',
      reagents: [
        { itemId: 'silk', quantity: 2, acquisition: 'buy' },
        { itemId: leather?.id, quantity: 4, acquisition: 'auto' },
      ],
    })

    const secondResult = useCraftStore.getState().importRecipe(importData)

    expect(secondResult).toMatchObject({
      success: true,
      productCreated: false,
      reagentsCreated: 0,
    })
    expect(Object.keys(useCraftStore.getState().items)).toHaveLength(4)
  })

  it('применяет подтверждённый выход и профессию к новому крафту и выбору auto', () => {
    const result = useCraftStore.getState().importRecipe({
      product: { wowheadItemId: 34113, name: 'Робот', iconUrl: '' },
      reagents: [{ wowheadItemId: 1, name: 'Реагент', iconUrl: '', quantity: 8 }],
      outputQuantity: 5,
      profession: 'engineering',
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    const catalog = useCraftStore.getState().items
    expect(catalog[result.productItemId]?.recipe).toMatchObject({
      outputQuantity: 5,
      profession: 'engineering',
    })
    expect(Object.keys(catalog)).toHaveLength(3)
    expect(getCraftUnitCost(catalog, result.productItemId)).toBe(16)
    expect(getAutomaticAcquisitionMethod(catalog, result.productItemId, new Set())).toBe(
      'buy',
    )
    expect(
      getAutomaticAcquisitionMethod(
        catalog,
        result.productItemId,
        new Set(['engineering']),
      ),
    ).toBe('craft')
  })

  it('заменяет локальные параметры явно подтверждёнными значениями', () => {
    expect(
      useCraftStore.getState().importRecipe({
        product: { wowheadItemId: 2, name: 'Изделие', iconUrl: '' },
        reagents: [{ wowheadItemId: 1, name: 'Реагент', iconUrl: '', quantity: 2 }],
        outputQuantity: 3,
        profession: 'alchemy',
      }).success,
    ).toBe(true)
    expect(useCraftStore.getState().items.product?.recipe).toMatchObject({
      outputQuantity: 3,
      profession: 'alchemy',
      reagents: [{ itemId: 'reagent', quantity: 2, acquisition: 'buy' }],
    })
  })

  it.each([
    { outputQuantity: 0 },
    { outputQuantity: 1.5 },
    { outputQuantity: Number.NaN },
    { profession: 'unknown' },
    { profession: undefined },
    { reagents: [] },
    { reagents: [{ wowheadItemId: 1, name: 'Реагент', iconUrl: '', quantity: 0 }] },
    { reagents: [{ wowheadItemId: 1, name: '', iconUrl: '', quantity: 2 }] },
  ])('атомарно отклоняет некорректные данные %j', (updates) => {
    const before = useCraftStore.getState().items
    const saved = localStorage.getItem('craft-calc-data')
    const data = {
      product: { wowheadItemId: 2, name: 'Изделие', iconUrl: '' },
      reagents: [{ wowheadItemId: 1, name: 'Реагент', iconUrl: '', quantity: 2 }],
      outputQuantity: 2,
      profession: null,
      ...updates,
    }
    // @ts-expect-error Deliberately pass invalid runtime data to verify atomic rejection.
    const result = useCraftStore.getState().importRecipe(data)
    expect(result.success).toBe(false)
    expect(useCraftStore.getState().items).toBe(before)
    expect(localStorage.getItem('craft-calc-data')).toBe(saved)
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
