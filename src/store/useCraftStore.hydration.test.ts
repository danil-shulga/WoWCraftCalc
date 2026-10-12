import type { Item } from '../domain/item.types'
import { createEmptyCraftData, STORAGE_KEY, STORAGE_VERSION } from './persistence'

const item: Item = {
  id: 'cloth',
  name: 'Ткань',
  names: { ru: null, en: null },
  iconUrl: '',
  sections: ['reagents'],
  purchasePriceCopper: 42,
  salePriceCopper: null,
  recipe: null,
}
const savedData = createEmptyCraftData()
savedData.workspaces.forever = { items: { cloth: item }, ownedProfessions: ['tailoring'] }
savedData.currencyDisplay = 'text'

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
})
afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

it('чистый запуск удаляет старый ключ и создаёт три пустых каталога', async () => {
  localStorage.setItem('craft-calc-data', '{broken')
  const { useCraftStore, usePersistenceStatusStore } = await import('./useCraftStore')
  expect(useCraftStore.getState()).toMatchObject(createEmptyCraftData())
  expect(localStorage.getItem('craft-calc-data')).toBeNull()
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  expect(usePersistenceStatusStore.getState().hydrationError).toBeNull()
})
it('перезагрузка восстанавливает все workspace и последнюю версию', async () => {
  const { useCraftStore } = await import('./useCraftStore')
  useCraftStore.getState().replaceData(savedData)
  useCraftStore.getState().setActiveVersion('tbc')
  const id = useCraftStore.getState().createItem({ ...item, purchasePriceCopper: 99 })
  useCraftStore.getState().setProfessionOwned('jewelcrafting', true)
  const raw = localStorage.getItem(STORAGE_KEY)
  vi.resetModules()
  const restored = await import('./useCraftStore')
  expect(restored.useCraftStore.getState().activeVersion).toBe('tbc')
  expect(
    restored.useCraftStore.getState().workspaces.tbc.items[id]?.purchasePriceCopper,
  ).toBe(99)
  expect(
    restored.useCraftStore.getState().workspaces.forever.items.cloth?.purchasePriceCopper,
  ).toBe(42)
  expect(restored.useCraftStore.getState().workspaces.tbc.ownedProfessions).toEqual([
    'jewelcrafting',
  ])
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw)
})
it.each([
  'null',
  '{broken',
  '',
  'false',
  '[]',
  '{"version":1}',
  '{"state":null,"version":1}',
  JSON.stringify({ state: savedData, version: 99 }),
])('защищает повреждённую запись %s', async (raw) => {
  localStorage.setItem(STORAGE_KEY, raw)
  const { useCraftStore, usePersistenceStatusStore } = await import('./useCraftStore')
  expect(useCraftStore.persist.hasHydrated()).toBe(false)
  expect(usePersistenceStatusStore.getState().recoveryRequired).toBe(true)
  useCraftStore.getState().createItem(item)
  useCraftStore.getState().setActiveVersion('classic')
  useCraftStore.getState().setCurrencyDisplay('text')
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw)
  expect(useCraftStore.getState().replaceData(savedData)).toBeNull()
  expect(usePersistenceStatusStore.getState().recoveryRequired).toBe(false)
})
it.each(['missing', 'cloth'])(
  'отклоняет повреждённый граф %s и не переписывает запись',
  async (itemId) => {
    const data = createEmptyCraftData()
    data.workspaces.classic.items.cloth = {
      ...item,
      recipe: {
        outputQuantity: 1,
        profession: null,
        reagents: [{ itemId, quantity: 1, acquisition: 'buy' }],
      },
    }
    const raw = JSON.stringify({ state: data, version: STORAGE_VERSION })
    localStorage.setItem(STORAGE_KEY, raw)
    const { useCraftStore, usePersistenceStatusStore } = await import('./useCraftStore')
    expect(usePersistenceStatusStore.getState().recoveryRequired).toBe(true)
    useCraftStore.getState().setCurrencyDisplay('text')
    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw)
  },
)
it('отличает отказ чтения от пустого хранилища', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('Чтение запрещено')
  })
  const { useCraftStore, usePersistenceStatusStore } = await import('./useCraftStore')
  expect(useCraftStore.persist.hasHydrated()).toBe(false)
  expect(usePersistenceStatusStore.getState().hydrationError).toBe('Чтение запрещено')
})
it.each(['импорт', 'сброс'])(
  'сохраняет текущие данные при отказе записи: %s',
  async (action) => {
    const { useCraftStore } = await import('./useCraftStore')
    useCraftStore.getState().replaceData(savedData)
    const before = useCraftStore.getState()
    const raw = localStorage.getItem(STORAGE_KEY)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Переполнено')
    })
    const result =
      action === 'импорт'
        ? before.replaceData(createEmptyCraftData())
        : before.resetData()
    expect(result).toBe('Переполнено')
    expect(useCraftStore.getState()).toBe(before)
    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw)
  },
)
it('показывает ошибку обычной записи и оставляет правки в памяти', async () => {
  const { useCraftStore, usePersistenceStatusStore } = await import('./useCraftStore')
  useCraftStore.getState().replaceData(savedData)
  const raw = localStorage.getItem(STORAGE_KEY)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Переполнено')
  })
  useCraftStore.getState().setItemPrice('cloth', 'purchasePriceCopper', 100)
  expect(usePersistenceStatusStore.getState().hydrationError).toBe('Переполнено')
  expect(
    useCraftStore.getState().workspaces.forever.items.cloth?.purchasePriceCopper,
  ).toBe(100)
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw)
})
