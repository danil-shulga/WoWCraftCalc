import { selectActiveWorkspace, selectItemsBySection } from './craft.selectors'
import { createExportJson, parseImportedData, STORAGE_KEY } from './persistence'
import { testCraftData } from '../test/craft-state'
import { useCraftStore } from './useCraftStore'

const data = testCraftData({
  items: Object.fromEntries(
    ['a', 'b', 'c'].map((id) => [
      id,
      {
        id,
        name: id,
        iconUrl: '',
        sections: ['crafts', 'reagents'],
        isFavorite: true,
        purchasePriceCopper: null,
        salePriceCopper: null,
        recipe: null,
      },
    ]),
  ),
})

function ids(section: 'crafts' | 'reagents' | 'favorites' = 'crafts') {
  const workspace = selectActiveWorkspace(useCraftStore.getState())
  return selectItemsBySection(
    workspace.items,
    section,
    'ru',
    workspace.rootItemOrder?.[section],
  ).map((item) => item.id)
}

describe('порядок корневых строк', () => {
  beforeEach(() => {
    useCraftStore.getState().replaceData(data)
  })

  it('перемещает в обе стороны, сохраняя независимый порядок разделов и версий', () => {
    const store = useCraftStore.getState()
    store.moveRootItem('crafts', 'c', 'a', 'before')
    expect(ids()).toEqual(['c', 'a', 'b'])
    expect(ids('reagents')).toEqual(['a', 'b', 'c'])
    expect(ids('favorites')).toEqual(['a', 'b', 'c'])
    store.moveRootItem('crafts', 'c', 'b', 'after')
    expect(ids()).toEqual(['a', 'b', 'c'])
    store.setActiveVersion('tbc')
    expect(selectActiveWorkspace(useCraftStore.getState()).rootItemOrder).toBeUndefined()
    store.setActiveVersion('forever')
    expect(ids()).toEqual(['a', 'b', 'c'])
  })

  it('игнорирует неизвестные ID и перенос на себя', () => {
    const store = useCraftStore.getState()
    const workspace = selectActiveWorkspace(store)
    store.moveRootItem('crafts', 'missing', 'a', 'before')
    store.moveRootItem('crafts', 'a', 'missing', 'after')
    store.moveRootItem('crafts', 'a', 'a', 'after')
    expect(selectActiveWorkspace(useCraftStore.getState())).toBe(workspace)
  })

  it('восстанавливает порядок из браузера и JSON, добавляет новые строки в конец', async () => {
    const store = useCraftStore.getState()
    store.moveRootItem('crafts', 'c', 'a', 'before')
    const saved = localStorage.getItem(STORAGE_KEY)
    store.replaceData(data)
    localStorage.setItem(STORAGE_KEY, saved ?? '')
    await useCraftStore.persist.rehydrate()
    expect(ids()).toEqual(['c', 'a', 'b'])
    const restored = parseImportedData(createExportJson(useCraftStore.getState()))
    expect(restored).toMatchObject({
      success: true,
      data: { workspaces: { forever: { rootItemOrder: { crafts: ['c', 'a', 'b'] } } } },
    })
    store.createItem({
      name: '0',
      iconUrl: '',
      sections: ['crafts'],
      purchasePriceCopper: null,
      salePriceCopper: null,
    })
    expect(ids().slice(0, 3)).toEqual(['c', 'a', 'b'])
    store.removeItem('a')
    expect(ids().slice(0, 2)).toEqual(['c', 'b'])
  })
})
