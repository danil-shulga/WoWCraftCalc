import { testCraftData } from '../test/craft-state'
import {
  selectActiveItems,
  selectActiveWorkspace,
  selectItemsBySection,
} from './craft.selectors'
import { createExportJson, parseImportedData, STORAGE_KEY } from './persistence'
import { useCraftStore } from './useCraftStore'

describe('видимость предметов в распылении', () => {
  beforeEach(() => {
    const data = testCraftData({ items: {} })
    data.activeVersion = 'tbc'
    useCraftStore.getState().replaceData(data)
  })

  it('сохраняет раздел и его независимый порядок в localStorage и JSON', async () => {
    const store = useCraftStore.getState()
    const a = store.createItem({
      name: 'A',
      iconUrl: '',
      sections: ['crafts', 'disenchanting'],
      purchasePriceCopper: 0,
      salePriceCopper: null,
    })
    const b = store.createItem({
      name: 'B',
      iconUrl: '',
      sections: ['disenchanting'],
      purchasePriceCopper: null,
      salePriceCopper: null,
    })
    store.moveRootItem('disenchanting', b, a, 'before')
    const workspace = selectActiveWorkspace(useCraftStore.getState())
    expect(
      selectItemsBySection(
        workspace.items,
        'disenchanting',
        'ru',
        workspace.rootItemOrder?.disenchanting,
      ).map(({ id }) => id),
    ).toEqual([b, a])
    expect(selectItemsBySection(workspace.items, 'crafts').map(({ id }) => id)).toEqual([
      a,
    ])
    const saved = localStorage.getItem(STORAGE_KEY)
    expect(parseImportedData(createExportJson(useCraftStore.getState()))).toMatchObject({
      success: true,
      data: { workspaces: { tbc: { rootItemOrder: { disenchanting: [b, a] } } } },
    })
    store.replaceData(testCraftData({ items: {} }))
    localStorage.setItem(STORAGE_KEY, saved ?? '')
    await useCraftStore.persist.rehydrate()
    expect(
      selectActiveWorkspace(useCraftStore.getState()).rootItemOrder?.disenchanting,
    ).toEqual([b, a])
    const item = selectActiveItems(useCraftStore.getState())[a]
    if (!item) throw new Error('Нет предмета')
    expect(store.saveItemEdit(a, { ...item, sections: ['crafts'] }, null)).toBeNull()
    expect(
      selectItemsBySection(
        selectActiveItems(useCraftStore.getState()),
        'disenchanting',
      ).map(({ id }) => id),
    ).toEqual([b])
  })

  it('добавляет из базы в выбранный раздел и сохраняет его при повторном импорте рецепта', () => {
    const store = useCraftStore.getState()
    const product = {
      name: 'Сапоги',
      iconUrl: '',
      wowheadItemId: 21853,
      wowheadVersion: 'tbc' as const,
    }
    const added = store.addReferenceItem(product, undefined, 'disenchanting')
    if (!added.success) throw new Error(added.error)
    expect(selectActiveItems(useCraftStore.getState())[added.itemId]?.sections).toEqual([
      'disenchanting',
    ])
    const result = store.importRecipe({
      product,
      reagents: [{ name: 'Ткань', iconUrl: '', wowheadItemId: 21877, quantity: 2 }],
      profession: 'tailoring',
      outputQuantity: 1,
      productSection: 'disenchanting',
    })
    expect(result).toMatchObject({ success: true, productCreated: false })
    expect(selectActiveItems(useCraftStore.getState())[added.itemId]?.sections).toEqual([
      'disenchanting',
      'crafts',
    ])
    expect(
      store.importRecipe({
        product,
        reagents: [{ name: 'Ткань', iconUrl: '', wowheadItemId: 21877, quantity: 2 }],
        profession: 'tailoring',
        outputQuantity: 1,
      }).success,
    ).toBe(true)
    expect(selectActiveItems(useCraftStore.getState())[added.itemId]?.sections).toContain(
      'disenchanting',
    )
    store.setActiveVersion('classic')
    expect(
      selectItemsBySection(selectActiveItems(useCraftStore.getState()), 'disenchanting'),
    ).toEqual([])
  })
})
