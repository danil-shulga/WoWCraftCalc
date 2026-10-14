import { selectActiveItems, selectItemsBySection } from './craft.selectors'
import { createExportJson, parseImportedData, STORAGE_KEY } from './persistence'
import { testCraftData } from '../test/craft-state'
import { useCraftStore } from './useCraftStore'

const data = testCraftData({
  items: {
    cloth: {
      id: 'cloth',
      name: 'Ткань',
      iconUrl: '',
      sections: ['reagents', 'crafts'],
      purchasePriceCopper: 10,
      salePriceCopper: null,
      recipe: null,
    },
  },
})

describe('избранное', () => {
  beforeEach(() => {
    localStorage.clear()
    useCraftStore.getState().replaceData(data)
  })

  it('добавляет и удаляет отметку, сохраняя сам предмет и его разделы', () => {
    const store = useCraftStore.getState()
    expect(selectItemsBySection(selectActiveItems(store), 'favorites')).toEqual([])
    store.setItemFavorite('cloth', true)
    expect(
      selectItemsBySection(selectActiveItems(useCraftStore.getState()), 'favorites'),
    ).toHaveLength(1)
    store.setItemFavorite('cloth', false)
    expect(selectActiveItems(useCraftStore.getState()).cloth).toMatchObject({
      isFavorite: false,
      sections: ['reagents', 'crafts'],
      purchasePriceCopper: 10,
    })
    const catalog = selectActiveItems(useCraftStore.getState())
    store.setItemFavorite('missing', true)
    store.setItemFavorite('cloth', false)
    expect(selectActiveItems(useCraftStore.getState())).toBe(catalog)
  })

  it('изолирует отметки одинаковых ID между версиями', () => {
    const store = useCraftStore.getState()
    const versionedData = {
      ...data,
      workspaces: { ...data.workspaces, tbc: data.workspaces.forever },
    }
    store.replaceData(versionedData)
    store.setItemFavorite('cloth', true)
    store.setActiveVersion('tbc')
    expect(selectActiveItems(useCraftStore.getState()).cloth?.isFavorite).toBeUndefined()
    store.setActiveVersion('forever')
    expect(selectActiveItems(useCraftStore.getState()).cloth?.isFavorite).toBe(true)
  })

  it('восстанавливает отметку из localStorage и резервной копии', async () => {
    const store = useCraftStore.getState()
    store.setItemFavorite('cloth', true)
    const saved = localStorage.getItem(STORAGE_KEY)
    store.setItemFavorite('cloth', false)
    localStorage.setItem(STORAGE_KEY, saved ?? '')
    await useCraftStore.persist.rehydrate()
    expect(selectActiveItems(useCraftStore.getState()).cloth?.isFavorite).toBe(true)
    const restored = parseImportedData(createExportJson(useCraftStore.getState()))
    expect(restored).toMatchObject({
      success: true,
      data: { workspaces: { forever: { items: { cloth: { isFavorite: true } } } } },
    })
  })

  it('сохраняет отметку при редактировании описания', () => {
    const store = useCraftStore.getState()
    store.setItemFavorite('cloth', true)
    expect(
      store.saveItemEdit(
        'cloth',
        {
          name: 'Новая ткань',
          iconUrl: '',
          sections: ['reagents'],
          purchasePriceCopper: 20,
          salePriceCopper: null,
        },
        null,
      ),
    ).toBeNull()
    expect(selectActiveItems(useCraftStore.getState()).cloth?.isFavorite).toBe(true)
  })

  it('отклоняет резервную копию с неверным типом отметки', () => {
    const raw = createExportJson(data).replace(
      '"name": "Ткань",',
      '"name": "Ткань", "isFavorite": "yes",',
    )
    expect(parseImportedData(raw).success).toBe(false)
  })

  it('сохраняет отметки продукта и реагента при повторном импорте рецепта', () => {
    const store = useCraftStore.getState()
    const recipe = {
      product: { wowheadItemId: 1, name: 'Рулон ткани', iconUrl: '' },
      reagents: [{ wowheadItemId: 2, name: 'Ткань', iconUrl: '', quantity: 2 }],
      outputQuantity: 1,
      profession: null,
    }
    const result = store.importRecipe(recipe)
    if (!result.success) throw new Error(result.error)
    store.setItemFavorite('cloth', true)
    store.setItemFavorite(result.productItemId, true)
    expect(store.importRecipe(recipe).success).toBe(true)
    const catalog = selectActiveItems(useCraftStore.getState())
    expect(catalog.cloth?.isFavorite).toBe(true)
    expect(catalog[result.productItemId]?.isFavorite).toBe(true)
  })
})
