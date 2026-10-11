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
})
