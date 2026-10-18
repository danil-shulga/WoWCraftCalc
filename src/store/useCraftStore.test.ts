import { testCraftData, setTestCraftState } from '../test/craft-state'
import { persistedCraftDataSchema } from '../domain/item.schema'
import { getAutomaticAcquisitionMethod, getCraftUnitCost } from '../domain/calculations'
import type { ItemCatalog } from '../domain/item.types'
import { useCraftStore, usePersistenceStatusStore } from './useCraftStore'

describe('настройки CraftStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useCraftStore.getState().replaceData(
      testCraftData({
        items: {},
        ownedProfessions: [],
        currencyDisplay: 'icons',
      }),
    )
    usePersistenceStatusStore.getState().setHydrationError(null)
  })

  it('использует иконки для сохранённых данных без настройки валют', () => {
    const parsed = persistedCraftDataSchema.parse(testCraftData())

    expect(parsed.currencyDisplay).toBe('icons')
  })

  it('сохраняет выбранное отображение валют', () => {
    useCraftStore.getState().setCurrencyDisplay('text')

    const persisted = JSON.parse(
      localStorage.getItem('craft-calc-versioned-data') ?? '{}',
    ) as {
      state?: { currencyDisplay?: string }
    }

    expect(useCraftStore.getState().currencyDisplay).toBe('text')
    expect(persisted.state?.currencyDisplay).toBe('text')
  })

  it('сохраняет EN и восстанавливает настройку после повторной загрузки', async () => {
    useCraftStore.getState().setItemLanguage('en')
    const saved = localStorage.getItem('craft-calc-versioned-data')
    expect(JSON.parse(saved ?? 'null') as unknown).toMatchObject({
      state: { itemLanguage: 'en' },
      version: 1,
    })
    setTestCraftState({ itemLanguage: 'ru' })
    localStorage.setItem('craft-calc-versioned-data', saved ?? 'null')
    await useCraftStore.persist.rehydrate()
    expect(useCraftStore.getState().itemLanguage).toBe('en')
  })
})

describe('целостность CraftStore', () => {
  const linkedCatalog: ItemCatalog = {
    reagent: {
      id: 'reagent',
      name: 'Реагент',
      names: { ru: null, en: null },
      iconUrl: '',
      sections: ['reagents'],
      purchasePriceCopper: 10,
      salePriceCopper: null,
      recipe: null,
    },
    product: {
      id: 'product',
      name: 'Изделие',
      names: { ru: null, en: null },
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
    useCraftStore.getState().replaceData(
      testCraftData({
        items: linkedCatalog,
        ownedProfessions: [],
        currencyDisplay: 'icons',
      }),
    )
    usePersistenceStatusStore.getState().setHydrationError(null)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('повторный двуязычный импорт дополняет имена и сохраняет локальные данные', () => {
    const store = useCraftStore.getState()
    const data = {
      product: {
        wowheadItemId: 2,
        wowheadVersion: 'forever' as const,
        name: 'Изделие',
        names: { ru: 'Изделие', en: 'Product' },
        iconUrl: '',
      },
      reagents: [
        {
          wowheadItemId: 1,
          wowheadVersion: 'forever' as const,
          name: 'Реагент',
          names: { ru: 'Реагент', en: 'Reagent' },
          iconUrl: '',
          quantity: 2,
        },
      ],
      outputQuantity: 1,
      profession: null,
    }
    expect(store.importRecipe(data)).toMatchObject({
      success: true,
      productCreated: false,
      reagentsCreated: 0,
    })
    expect(
      store.importRecipe({ ...data, product: { ...data.product, name: 'Product' } }),
    ).toMatchObject({ success: true, productCreated: false, reagentsCreated: 0 })
    expect(
      useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items
        .product,
    ).toMatchObject({
      names: data.product.names,
      salePriceCopper: 100,
      recipe: { reagents: [{ itemId: 'reagent', quantity: 2, acquisition: 'buy' }] },
    })
    expect(
      useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items
        .reagent?.purchasePriceCopper,
    ).toBe(10)
    expect(
      Object.keys(
        useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items,
      ),
    ).toHaveLength(2)
  })

  it('заполняет только отсутствующие переводы одним обновлением и сохраняет цены и рецепт', () => {
    const original =
      useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items
        .reagent
    if (original === undefined) throw new Error('Нет тестового предмета')
    const item = {
      ...original,
      names: { ru: 'Мой реагент', en: null },
      source: { wowheadItemId: 1 },
    }
    setTestCraftState({
      items: {
        ...useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion]
          .items,
        reagent: item,
      },
    })
    const listener = vi.fn()
    const unsubscribe = useCraftStore.subscribe(listener)
    const before = useCraftStore.getState()
    expect(
      before.fillItemNames([
        {
          itemId: 'reagent',
          wowheadItemId: 1,
          wowheadVersion: 'forever',
          names: { ru: 'Реагент', en: 'Reagent' },
        },
      ]),
    ).toBeNull()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(
      useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items
        .reagent,
    ).toMatchObject({
      names: { ru: 'Мой реагент', en: 'Reagent' },
      purchasePriceCopper: 10,
      source: { wowheadItemId: 1, wowheadVersion: 'forever' },
    })
    expect(
      useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items
        .product?.recipe,
    ).toBe(before.workspaces[before.activeVersion].items.product?.recipe)
    unsubscribe()
  })

  it('отклоняет весь пакет названий, если источник изменился после загрузки', () => {
    const before = useCraftStore.getState()
    expect(
      before.fillItemNames([
        {
          itemId: 'reagent',
          wowheadItemId: 1,
          wowheadVersion: 'forever',
          names: { ru: 'Реагент', en: 'Reagent' },
        },
      ]),
    ).toContain('Каталог изменился')
    expect(useCraftStore.getState()).toBe(before)
  })

  it('обновляет цены одним уведомлением и одной записью, сохраняя остальные данные', () => {
    const before = useCraftStore.getState()
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const listener = vi.fn()
    const unsubscribe = useCraftStore.subscribe(listener)

    try {
      before.setItemPrices('purchasePriceCopper', {
        reagent: 0,
        product: 50,
        missing: 100,
      })

      const after = useCraftStore.getState()
      expect(listener).toHaveBeenCalledTimes(1)
      expect(
        setItem.mock.calls.filter(([key]) => key === 'craft-calc-versioned-data'),
      ).toHaveLength(1)
      expect(after.workspaces[after.activeVersion].items).toEqual({
        reagent: {
          ...before.workspaces[before.activeVersion].items.reagent,
          purchasePriceCopper: 0,
        },
        product: {
          ...before.workspaces[before.activeVersion].items.product,
          purchasePriceCopper: 50,
        },
      })
      expect(
        before.workspaces[before.activeVersion].items.reagent?.purchasePriceCopper,
      ).toBe(10)
      expect(
        before.workspaces[before.activeVersion].items.product?.purchasePriceCopper,
      ).toBeNull()
      expect(after.workspaces[after.activeVersion].items.product?.recipe).toBe(
        before.workspaces[before.activeVersion].items.product?.recipe,
      )
      expect(after.workspaces[after.activeVersion].ownedProfessions).toBe(
        before.workspaces[before.activeVersion].ownedProfessions,
      )
      expect(after.currencyDisplay).toBe(before.currencyDisplay)
      expect(
        JSON.parse(
          localStorage.getItem('craft-calc-versioned-data') ?? 'null',
        ) as unknown,
      ).toEqual({
        state: {
          activeVersion: after.activeVersion,
          workspaces: after.workspaces,
          currencyDisplay: before.currencyDisplay,
          itemLanguage: before.itemLanguage,
          tbcPricing: before.tbcPricing,
          classicPricing: before.classicPricing,
        },
        version: 1,
      })
    } finally {
      unsubscribe()
    }
  })

  it.each([{}, { reagent: 10, product: null }, { missing: 0 }])(
    'не обновляет состояние и не пишет пакет без изменений %j',
    (prices) => {
      const before = useCraftStore.getState()
      const setItem = vi.spyOn(Storage.prototype, 'setItem')
      const listener = vi.fn()
      const unsubscribe = useCraftStore.subscribe(listener)

      try {
        before.setItemPrices('purchasePriceCopper', prices)

        expect(useCraftStore.getState()).toBe(before)
        expect(listener).not.toHaveBeenCalled()
        expect(setItem).not.toHaveBeenCalled()
      } finally {
        unsubscribe()
      }
    },
  )

  it('пропускает неизменённые предметы в смешанном пакете и различает null и ноль', () => {
    const before =
      useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items

    useCraftStore
      .getState()
      .setItemPrices('salePriceCopper', { reagent: null, product: 0 })

    expect(
      useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items
        .reagent,
    ).toBe(before.reagent)
    expect(
      useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items
        .product?.salePriceCopper,
    ).toBe(0)
    useCraftStore.getState().setItemPrices('salePriceCopper', { product: null })
    expect(
      useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items
        .product?.salePriceCopper,
    ).toBeNull()
  })

  it('не сохраняет пустой рецепт', () => {
    const error = useCraftStore.getState().setRecipe('product', {
      outputQuantity: 1,
      profession: null,
      reagents: [],
    })

    expect(error).toContain('Добавьте хотя бы один реагент')
    expect(
      useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items
        .product?.recipe,
    ).not.toBeNull()
  })

  it('удаляет рецепт, если вместе с предметом исчез последний реагент', () => {
    useCraftStore.getState().removeItem('reagent')

    expect(
      useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items
        .product?.recipe,
    ).toBeNull()
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
    useCraftStore.getState().replaceData(
      testCraftData({
        items: catalogWithImportedItems,
        ownedProfessions: [],
        currencyDisplay: 'icons',
      }),
    )

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
    const firstItems =
      useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items
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
    expect(
      Object.keys(
        useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items,
      ),
    ).toHaveLength(4)
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
    const catalog =
      useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items
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
    expect(
      useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items
        .product?.recipe,
    ).toMatchObject({
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
    const before =
      useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items
    const saved = localStorage.getItem('craft-calc-versioned-data')
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
    expect(
      useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items,
    ).toBe(before)
    expect(localStorage.getItem('craft-calc-versioned-data')).toBe(saved)
  })

  it('сохраняет текущее состояние и сообщает об ошибке hydration', async () => {
    const product = linkedCatalog.product
    if (!product) throw new Error('Нет результата')
    const invalid = testCraftData({
      items: {
        product: {
          ...product,
          recipe: {
            outputQuantity: 1,
            profession: null,
            reagents: [{ itemId: 'missing', quantity: 1, acquisition: 'buy' }],
          },
        },
      },
    })
    localStorage.setItem(
      'craft-calc-versioned-data',
      JSON.stringify({ version: 1, state: invalid }),
    )
    await useCraftStore.persist.rehydrate()
    expect(useCraftStore.getState().workspaces.forever.items).toEqual(linkedCatalog)
    expect(usePersistenceStatusStore.getState().hydrationError).toContain(
      'Один из реагентов отсутствует',
    )
  })
})
