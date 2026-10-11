import type { Item, PersistedCraftData } from '../domain/item.types'

const storageKey = 'craft-calc-data'
const item: Item = {
  id: 'cloth',
  name: 'Ткань',
  iconUrl: '',
  sections: ['reagents'],
  purchasePriceCopper: 42,
  salePriceCopper: null,
  recipe: null,
}
const savedData: PersistedCraftData = {
  items: { cloth: item },
  ownedProfessions: ['tailoring'],
  currencyDisplay: 'text',
}

describe('первоначальная загрузка CraftStore', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('создаёт пустой store без ошибки и записи в пустом хранилище', async () => {
    const { useCraftStore, usePersistenceStatusStore } = await import('./useCraftStore')

    expect(useCraftStore.getState()).toMatchObject({
      items: {},
      ownedProfessions: [],
      currencyDisplay: 'icons',
    })
    expect(useCraftStore.persist.hasHydrated()).toBe(true)
    expect(usePersistenceStatusStore.getState().hydrationError).toBeNull()
    expect(localStorage.getItem(storageKey)).toBeNull()
  })

  it('сохраняет первый предмет и настройки и восстанавливает их в новом store', async () => {
    const { useCraftStore, usePersistenceStatusStore } = await import('./useCraftStore')
    expect(usePersistenceStatusStore.getState().hydrationError).toBeNull()

    const itemId = useCraftStore.getState().createItem({
      name: item.name,
      iconUrl: item.iconUrl,
      sections: item.sections,
      purchasePriceCopper: item.purchasePriceCopper,
      salePriceCopper: item.salePriceCopper,
    })
    useCraftStore.getState().setProfessionOwned('tailoring', true)
    useCraftStore.getState().setCurrencyDisplay('text')
    const expectedData: PersistedCraftData = {
      ...savedData,
      items: { [itemId]: { ...item, id: itemId } },
    }
    const rawRecord = localStorage.getItem(storageKey)
    expect(JSON.parse(rawRecord ?? 'null') as unknown).toEqual({
      state: expectedData,
      version: 4,
    })

    vi.resetModules()
    const restored = await import('./useCraftStore')

    expect(restored.useCraftStore).not.toBe(useCraftStore)
    expect(restored.useCraftStore.getState()).toMatchObject(expectedData)
    expect(restored.useCraftStore.persist.hasHydrated()).toBe(true)
    expect(restored.usePersistenceStatusStore.getState().hydrationError).toBeNull()
    expect(localStorage.getItem(storageKey)).toBe(rawRecord)
  })

  it('восстанавливает валидную запись и настройки без перезаписи', async () => {
    const rawRecord = JSON.stringify({ state: savedData, version: 4 })
    localStorage.setItem(storageKey, rawRecord)

    const { useCraftStore, usePersistenceStatusStore } = await import('./useCraftStore')

    expect(useCraftStore.getState()).toMatchObject(savedData)
    expect(useCraftStore.persist.hasHydrated()).toBe(true)
    expect(usePersistenceStatusStore.getState().hydrationError).toBeNull()
    expect(localStorage.getItem(storageKey)).toBe(rawRecord)
  })

  it('восстанавливает пакет цен в новом store и пересчитывает вложенный рецепт', async () => {
    const { useCraftStore } = await import('./useCraftStore')
    const recipe = {
      outputQuantity: 1,
      profession: null,
      reagents: [{ itemId: 'cloth', quantity: 2, acquisition: 'buy' as const }],
    }
    useCraftStore.getState().replaceData({
      ...savedData,
      items: {
        cloth: item,
        thread: { ...item, id: 'thread', recipe },
        product: {
          ...item,
          id: 'product',
          recipe: {
            ...recipe,
            reagents: [{ itemId: 'thread', quantity: 3, acquisition: 'craft' }],
          },
        },
      },
    })
    const { getCraftUnitCost } = await import('../domain/calculations')
    expect(getCraftUnitCost(useCraftStore.getState().items, 'product')).toBe(252)
    const setItem = vi.spyOn(Storage.prototype, 'setItem')

    useCraftStore
      .getState()
      .setItemPrices('purchasePriceCopper', { cloth: 10, thread: 0 })

    expect(setItem.mock.calls.filter(([key]) => key === storageKey)).toHaveLength(1)
    expect(getCraftUnitCost(useCraftStore.getState().items, 'product')).toBe(60)
    const expected = useCraftStore.getState().items
    vi.resetModules()
    const restored = await import('./useCraftStore')
    expect(restored.useCraftStore.getState()).toMatchObject({
      ...savedData,
      items: expected,
    })
    expect(getCraftUnitCost(restored.useCraftStore.getState().items, 'product')).toBe(60)
    expect(setItem.mock.calls.filter(([key]) => key === storageKey)).toHaveLength(1)
  })

  it.each([
    ['JSON null', 'null'],
    ['неверный JSON', '{broken'],
    ['пустая строка', ''],
    ['JSON false', 'false'],
    ['массив', '[]'],
    ['отсутствующее state', '{"version":4}'],
    ['state null', '{"state":null,"version":4}'],
    ['несовместимое state', '{"state":{"items":[]},"version":4}'],
    ['неверная версия', JSON.stringify({ state: savedData, version: '4' })],
  ])('сообщает об ошибке и сохраняет исходную запись: %s', async (_label, rawRecord) => {
    localStorage.setItem(storageKey, rawRecord)

    const { useCraftStore, usePersistenceStatusStore } = await import('./useCraftStore')

    expect(useCraftStore.getState().items).toEqual({})
    expect(useCraftStore.persist.hasHydrated()).toBe(false)
    expect(usePersistenceStatusStore.getState().hydrationError).toEqual(
      expect.any(String),
    )
    expect(localStorage.getItem(storageKey)).toBe(rawRecord)
    useCraftStore.getState().setCurrencyDisplay('text')
    useCraftStore.getState().createItem({ ...item, name: 'Черновик' })
    expect(localStorage.getItem(storageKey)).toBe(rawRecord)
  })

  it.each([
    ['missing', 'Один из реагентов отсутствует в каталоге'],
    ['cloth', 'Этот рецепт создаёт циклическую зависимость'],
  ])(
    'отклоняет повреждённый граф с реагентом %s без перезаписи',
    async (itemId, error) => {
      const rawRecord = JSON.stringify({
        version: 4,
        state: {
          ...savedData,
          items: {
            cloth: {
              ...item,
              recipe: {
                outputQuantity: 1,
                profession: null,
                reagents: [{ itemId, quantity: 1, acquisition: 'buy' }],
              },
            },
          },
        },
      })
      localStorage.setItem(storageKey, rawRecord)

      const { useCraftStore, usePersistenceStatusStore } = await import('./useCraftStore')

      expect(useCraftStore.getState().items).toEqual({})
      expect(useCraftStore.persist.hasHydrated()).toBe(false)
      expect(usePersistenceStatusStore.getState().hydrationError).toContain(error)
      expect(localStorage.getItem(storageKey)).toBe(rawRecord)
      useCraftStore.getState().setCurrencyDisplay('text')
      expect(localStorage.getItem(storageKey)).toBe(rawRecord)
    },
  )

  it('отличает ошибку чтения от пустого хранилища', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Чтение хранилища запрещено')
    })

    const { useCraftStore, usePersistenceStatusStore } = await import('./useCraftStore')

    expect(useCraftStore.persist.hasHydrated()).toBe(false)
    expect(usePersistenceStatusStore.getState().hydrationError).toBe(
      'Чтение хранилища запрещено',
    )
  })

  it('защищает исходную строку от всех обычных записей после ошибки rehydrate', async () => {
    const { useCraftStore } = await import('./useCraftStore')
    useCraftStore.getState().replaceData({
      ...savedData,
      items: {
        ...savedData.items,
        product: { ...item, id: 'product', name: 'Изделие', sections: ['crafts'] },
      },
    })
    const rawRecord = '{broken'
    localStorage.setItem(storageKey, rawRecord)
    await useCraftStore.persist.rehydrate()

    const store = useCraftStore.getState()
    const actions = [
      () => {
        store.setCurrencyDisplay('icons')
      },
      () => {
        store.setProfessionOwned('mining', true)
      },
      () => {
        store.setItemPrice('cloth', 'purchasePriceCopper', 100)
      },
      () => {
        const setItem = vi.spyOn(Storage.prototype, 'setItem')
        store.setItemPrices('purchasePriceCopper', { cloth: 0, product: null })
        expect(useCraftStore.getState().items.cloth?.purchasePriceCopper).toBe(0)
        expect(useCraftStore.getState().items.product?.purchasePriceCopper).toBeNull()
        expect(setItem).not.toHaveBeenCalled()
        setItem.mockRestore()
      },
      () => {
        store.updateItem('cloth', { ...item, name: 'Новая ткань' })
      },
      () => store.createItem({ ...item, name: 'Новый предмет' }),
      () => {
        expect(
          store.setRecipe('product', {
            outputQuantity: 1,
            profession: null,
            reagents: [{ itemId: 'cloth', quantity: 3, acquisition: 'buy' }],
          }),
        ).toBeNull()
      },
      () => {
        store.setAcquisition('product', 'cloth', 'craft')
        expect(
          useCraftStore.getState().items.product?.recipe?.reagents[0]?.acquisition,
        ).toBe('craft')
      },
      () => store.setRecipe('product', null),
      () =>
        store.importRecipe({
          outputQuantity: 1,
          profession: null,
          product: { wowheadItemId: 4305, name: 'Рулон ткани', iconUrl: '' },
          reagents: [{ wowheadItemId: 4306, name: 'Ткань', iconUrl: '', quantity: 2 }],
        }),
      () => {
        store.removeItem('cloth')
      },
      () => useCraftStore.setState({ currencyDisplay: 'text' }),
      () => {
        useCraftStore.persist.clearStorage()
      },
    ]

    for (const action of actions) {
      action()
      expect(localStorage.getItem(storageKey)).toBe(rawRecord)
    }

    await useCraftStore.persist.rehydrate()
    store.setCurrencyDisplay('icons')
    expect(localStorage.getItem(storageKey)).toBe(rawRecord)
  })

  it('явно восстанавливает валидные данные, снимает защиту и переживает перезагрузку', async () => {
    localStorage.setItem(storageKey, '{broken')
    const { useCraftStore, usePersistenceStatusStore } = await import('./useCraftStore')
    expect(usePersistenceStatusStore.getState().recoveryRequired).toBe(true)

    expect(useCraftStore.getState().replaceData(savedData)).toBeNull()
    expect(usePersistenceStatusStore.getState()).toMatchObject({
      recoveryRequired: false,
      hydrationError: null,
    })
    useCraftStore.getState().setItemPrice('cloth', 'purchasePriceCopper', 99)
    const recoveredData = {
      ...savedData,
      items: { cloth: { ...item, purchasePriceCopper: 99 } },
    }
    expect(JSON.parse(localStorage.getItem(storageKey) ?? 'null') as unknown).toEqual({
      state: recoveredData,
      version: 4,
    })

    vi.resetModules()
    const restored = await import('./useCraftStore')
    expect(restored.useCraftStore.getState()).toMatchObject(recoveredData)
    expect(restored.usePersistenceStatusStore.getState().recoveryRequired).toBe(false)
  })

  it('сохраняет оригинал и текущий каталог при неверных данных восстановления', async () => {
    localStorage.setItem(storageKey, '{broken')
    const { useCraftStore, usePersistenceStatusStore } = await import('./useCraftStore')
    useCraftStore.getState().createItem({ ...item, name: 'Черновик' })
    const currentItems = useCraftStore.getState().items
    const invalidData = {
      ...savedData,
      items: {
        cloth: {
          ...item,
          recipe: {
            outputQuantity: 1,
            profession: null,
            reagents: [{ itemId: 'missing', quantity: 1, acquisition: 'buy' as const }],
          },
        },
      },
    }

    expect(useCraftStore.getState().replaceData(invalidData)).toContain(
      'Один из реагентов отсутствует в каталоге',
    )
    expect(useCraftStore.getState().items).toBe(currentItems)
    expect(localStorage.getItem(storageKey)).toBe('{broken')
    expect(usePersistenceStatusStore.getState().recoveryRequired).toBe(true)
  })

  it.each(['импорт', 'сброс'])(
    'сохраняет защиту при отказе записи: %s',
    async (action) => {
      localStorage.setItem(storageKey, '{broken')
      const { useCraftStore, usePersistenceStatusStore } = await import('./useCraftStore')
      const originalState = useCraftStore.getState()
      const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('Запись хранилища запрещена')
      })

      const result =
        action === 'импорт'
          ? originalState.replaceData(savedData)
          : originalState.resetData()

      expect(result).toBe('Запись хранилища запрещена')
      expect(useCraftStore.getState()).toBe(originalState)
      expect(localStorage.getItem(storageKey)).toBe('{broken')
      expect(usePersistenceStatusStore.getState().recoveryRequired).toBe(true)
      originalState.setCurrencyDisplay('text')
      expect(setItem).toHaveBeenCalledTimes(1)
      setItem.mockRestore()
      originalState.setProfessionOwned('mining', true)
      expect(localStorage.getItem(storageKey)).toBe('{broken')
      expect(originalState.replaceData(savedData)).toBeNull()
    },
  )

  it('явно сбрасывает данные и возобновляет обычное сохранение', async () => {
    localStorage.setItem(storageKey, '{broken')
    const { useCraftStore, usePersistenceStatusStore } = await import('./useCraftStore')
    expect(useCraftStore.getState().resetData()).toBeNull()
    expect(usePersistenceStatusStore.getState().recoveryRequired).toBe(false)
    expect(JSON.parse(localStorage.getItem(storageKey) ?? 'null') as unknown).toEqual({
      state: { items: {}, ownedProfessions: [], currencyDisplay: 'icons' },
      version: 4,
    })
    useCraftStore.getState().setCurrencyDisplay('text')
    vi.resetModules()
    const restored = await import('./useCraftStore')
    expect(restored.useCraftStore.getState().currencyDisplay).toBe('text')
    expect(restored.usePersistenceStatusStore.getState().hydrationError).toBeNull()
  })
})
