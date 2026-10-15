import { testCraftData } from '../test/craft-state'
import { selectActiveItems, selectPlannerTargets } from './craft.selectors'
import { createExportJson, parseImportedData, STORAGE_KEY } from './persistence'
import { useCraftStore, usePersistenceStatusStore } from './useCraftStore'
import type { PlannerTarget } from '../domain/planner.types'

const data = testCraftData({
  items: {
    ore: {
      id: 'ore',
      name: 'Руда',
      iconUrl: '',
      sections: ['reagents'],
      purchasePriceCopper: 1,
      salePriceCopper: null,
      recipe: null,
    },
    bar: {
      id: 'bar',
      name: 'Слиток',
      iconUrl: '',
      sections: ['crafts'],
      purchasePriceCopper: null,
      salePriceCopper: 5,
      recipe: {
        outputQuantity: 3,
        profession: null,
        reagents: [{ itemId: 'ore', quantity: 2, acquisition: 'buy' }],
      },
    },
  },
})
const targets = () => selectPlannerTargets(useCraftStore.getState())

describe('хранение плана', () => {
  beforeEach(() => {
    localStorage.clear()
    useCraftStore.getState().replaceData(data)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })
  it('добавляет и меняет цель, не записывает повторы и неверный ввод', () => {
    const store = useCraftStore.getState()
    store.setPlannerQuantity('bar', 4)
    store.setPlannerQuantity('ore', 2)
    store.setPlannerQuantity('bar', 6)
    expect(targets()).toEqual([
      { itemId: 'bar', quantity: 6 },
      { itemId: 'ore', quantity: 2 },
    ])
    const write = vi.spyOn(Storage.prototype, 'setItem')
    store.setPlannerQuantity('bar', 6)
    store.setPlannerQuantity('missing', 1)
    for (const quantity of [0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])
      store.setPlannerQuantity('bar', quantity)
    expect(write).not.toHaveBeenCalled()
    store.removePlannerTarget('bar')
    expect(targets()).toEqual([{ itemId: 'ore', quantity: 2 }])
    store.clearPlanner()
    expect(targets()).toEqual([])
    expect(Object.keys(selectActiveItems(useCraftStore.getState()))).toHaveLength(2)
  })
  it('сохраняет запрос при смене выхода и удалении рецепта; удаляет цель вместе с предметом', () => {
    const store = useCraftStore.getState()
    store.setPlannerQuantity('bar', 6)
    store.setRecipe('bar', {
      outputQuantity: 5,
      profession: null,
      reagents: [{ itemId: 'ore', quantity: 2, acquisition: 'buy' }],
    })
    expect(targets()[0]?.quantity).toBe(6)
    store.setRecipe('bar', null)
    expect(targets()[0]?.quantity).toBe(6)
    store.removeItem('bar')
    expect(targets()).toEqual([])
  })
  it('изолирует версии и восстанавливает все планы из JSON и localStorage', async () => {
    const store = useCraftStore.getState()
    store.replaceData({
      ...data,
      workspaces: {
        forever: data.workspaces.forever,
        tbc: data.workspaces.forever,
        classic: data.workspaces.forever,
      },
    })
    for (const [index, version] of (['forever', 'tbc', 'classic'] as const).entries()) {
      store.setActiveVersion(version)
      expect(targets()).toEqual([])
      store.setPlannerQuantity('bar', index + 1)
    }
    const exported = parseImportedData(createExportJson(useCraftStore.getState()))
    expect(exported.success).toBe(true)
    if (!exported.success) throw new Error(exported.error)
    expect(exported.data.workspaces.forever.planner?.targets[0]?.quantity).toBe(1)
    expect(exported.data.workspaces.tbc.planner?.targets[0]?.quantity).toBe(2)
    expect(exported.data.workspaces.classic.planner?.targets[0]?.quantity).toBe(3)
    const raw = localStorage.getItem(STORAGE_KEY)
    store.clearPlanner()
    localStorage.setItem(STORAGE_KEY, raw ?? '')
    await useCraftStore.persist.rehydrate()
    expect(targets()[0]?.quantity).toBe(3)
    store.resetData()
    expect(targets()).toEqual([])
  })
  it.each<PlannerTarget[]>([
    [{ itemId: 'missing', quantity: 1 }],
    [{ itemId: 'bar', quantity: 0 }],
    [{ itemId: 'bar', quantity: 1.5 }],
    [{ itemId: 'bar', quantity: Number.MAX_SAFE_INTEGER + 1 }],
    [
      { itemId: 'bar', quantity: 1 },
      { itemId: 'bar', quantity: 2 },
    ],
  ])('отклоняет повреждённый план атомарно: %j', (...invalid) => {
    const bad = {
      ...data,
      workspaces: {
        ...data.workspaces,
        forever: { ...data.workspaces.forever, planner: { targets: invalid } },
      },
    }
    const before = useCraftStore.getState().workspaces
    expect(useCraftStore.getState().replaceData(bad)).not.toBeNull()
    expect(useCraftStore.getState().workspaces).toBe(before)
    expect(
      parseImportedData(
        JSON.stringify({
          format: 'craftcalc-versioned-backup',
          version: 1,
          exportedAt: '',
          data: bad,
        }),
      ).success,
    ).toBe(false)
  })
  it('читает v1 без planner и сообщает об отказе сохранения плана', () => {
    expect(parseImportedData(createExportJson(data))).toMatchObject({
      success: true,
      data,
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Нет места')
    })
    useCraftStore.getState().setPlannerQuantity('bar', 3)
    expect(usePersistenceStatusStore.getState().hydrationError).toBe('Нет места')
    expect(targets()[0]?.quantity).toBe(3)
  })
})
