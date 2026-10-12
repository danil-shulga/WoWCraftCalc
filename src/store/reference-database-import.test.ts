import { testCraftData, setTestCraftState } from '../test/craft-state'
import {
  referenceItemToImport,
  referenceRecipeToImport,
} from '../domain/reference-database-import'
import { parseReferenceDatabase } from '../domain/reference-database.schema'
import { referenceFixture } from '../test/reference-fixture'
import { useCraftStore } from './useCraftStore'

const db = parseReferenceDatabase(referenceFixture())
const recipe = db.recipes['10']
const reagent = db.items['2']
if (!recipe || !reagent) throw new Error('Нет фикстуры')
const data = referenceRecipeToImport(db, recipe, 3)
const reagentData = referenceItemToImport(reagent, db.gameVersion)

describe('импорт базы в store', () => {
  beforeEach(() => {
    useCraftStore
      .getState()
      .replaceData(
        testCraftData({ items: {}, ownedProfessions: [], currencyDisplay: 'icons' }),
      )
  })
  it('заполняет цены, сохраняет 0 и заданные цены, независимо дополняет null и восстанавливает запись', async () => {
    const store = useCraftStore.getState()
    const listener = vi.fn()
    const unsubscribe = useCraftStore.subscribe(listener)
    const result = store.importRecipe(data)
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    if (!result.success) throw new Error(result.error)
    const productId = result.productItemId
    const reagentId = Object.values(
      useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items,
    ).find((item) => item.source?.wowheadItemId === 2)?.id
    if (!reagentId) throw new Error('Нет реагента')
    expect(
      useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items[
        productId
      ],
    ).toMatchObject({
      purchasePriceCopper: null,
      salePriceCopper: null,
      source: { wowheadVersion: 'forever' },
    })
    expect(
      useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items[
        reagentId
      ],
    ).toMatchObject({
      purchasePriceCopper: null,
      salePriceCopper: null,
    })
    store.setItemPrice(productId, 'purchasePriceCopper', 0)
    store.setItemPrice(productId, 'salePriceCopper', null)
    store.setItemPrice(reagentId, 'purchasePriceCopper', 99)
    store.setAcquisition(productId, reagentId, 'buy')
    expect(store.importRecipe(data)).toMatchObject({
      success: true,
      productCreated: false,
      reagentsCreated: 0,
    })
    expect(
      useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items[
        productId
      ],
    ).toMatchObject({
      purchasePriceCopper: 0,
      salePriceCopper: null,
      recipe: { reagents: [{ acquisition: 'buy' }] },
    })
    expect(
      useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items[
        reagentId
      ]?.purchasePriceCopper,
    ).toBe(99)
    const saved = localStorage.getItem('craft-calc-versioned-data')
    setTestCraftState({ items: {} })
    localStorage.setItem('craft-calc-versioned-data', saved ?? '')
    await useCraftStore.persist.rehydrate()
    expect(
      useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items[
        productId
      ]?.salePriceCopper,
    ).toBeNull()
    expect(
      Object.keys(
        useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items,
      ),
    ).toHaveLength(2)
  })
  it('добавляет отдельный реагент без дублирования и сохраняет его рецепт при повторном добавлении', () => {
    const store = useCraftStore.getState()
    const first = store.addReferenceItem(reagentData)
    if (!first.success) throw new Error(first.error)
    expect(store.addReferenceItem(reagentData)).toEqual({ ...first, created: false })
    expect(
      Object.keys(
        useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items,
      ),
    ).toHaveLength(1)
    store.importRecipe(data)
    const productId = Object.values(
      useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items,
    ).find((item) => item.source?.wowheadItemId === 1)?.id
    if (!productId) throw new Error('Нет результата')
    const previousRecipe =
      useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items[
        productId
      ]?.recipe
    store.addReferenceItem(data.product)
    expect(
      useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items[
        productId
      ]?.recipe,
    ).toBe(previousRecipe)
    expect(
      useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items[
        productId
      ]?.sections,
    ).toEqual(['crafts', 'reagents'])
  })
  it('отклоняет предмет другой версии', () => {
    const store = useCraftStore.getState()
    expect(
      store.addReferenceItem({ ...reagentData, wowheadVersion: 'classic' }).success,
    ).toBe(false)
    store.addReferenceItem(reagentData)
    expect(Object.keys(useCraftStore.getState().workspaces.forever.items)).toHaveLength(1)
  })
  it.each([false, true])(
    'не записывает ничего при неоднозначности (source: %s)',
    (withSource) => {
      const store = useCraftStore.getState()
      const item = {
        name: reagentData.name,
        names: reagentData.names,
        iconUrl: '',
        sections: ['reagents' as const],
        purchasePriceCopper: null,
        salePriceCopper: null,
        ...(withSource
          ? {
              source: {
                wowheadItemId: reagentData.wowheadItemId,
                wowheadVersion: 'forever' as const,
              },
            }
          : {}),
      }
      store.createItem(item)
      store.createItem(item)
      const before = useCraftStore.getState()
      const saved = localStorage.getItem('craft-calc-versioned-data')
      const result = store.importRecipe(data)
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toContain('Неоднозначное')
      expect(store.addReferenceItem(reagentData).success).toBe(false)
      expect(useCraftStore.getState()).toBe(before)
      expect(localStorage.getItem('craft-calc-versioned-data')).toBe(saved)
    },
  )
  it('независимо заполняет null у существующего реагента, переносит нулевую цену базы и сохраняет 0 пользователя', () => {
    const store = useCraftStore.getState()
    const added = store.addReferenceItem({
      ...reagentData,
      defaultPurchasePriceCopper: null,
      defaultSalePriceCopper: 0,
    })
    if (!added.success) throw new Error(added.error)
    store.importRecipe({
      ...data,
      reagents: data.reagents.map((line) => ({
        ...line,
        defaultPurchasePriceCopper: 55,
        defaultSalePriceCopper: 33,
      })),
    })
    expect(
      useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items[
        added.itemId
      ],
    ).toMatchObject({
      purchasePriceCopper: null,
      salePriceCopper: 0,
    })
    store.setItemPrice(added.itemId, 'purchasePriceCopper', 0)
    store.setItemPrice(added.itemId, 'salePriceCopper', null)
    store.importRecipe({
      ...data,
      reagents: data.reagents.map((line) => ({
        ...line,
        defaultPurchasePriceCopper: 44,
        defaultSalePriceCopper: 0,
      })),
    })
    expect(
      useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items[
        added.itemId
      ],
    ).toMatchObject({
      purchasePriceCopper: 0,
      salePriceCopper: null,
    })
  })
  it('сохраняет вложенные рецепты и атомарно отклоняет цикл даже с новым реагентом', () => {
    const store = useCraftStore.getState()
    const imported = store.importRecipe(data)
    if (!imported.success) throw new Error(imported.error)
    const reagentId = Object.values(
      useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items,
    ).find((item) => item.source?.wowheadItemId === 2)?.id
    if (!reagentId) throw new Error('Нет реагента')
    const before = useCraftStore.getState()
    const saved = localStorage.getItem('craft-calc-versioned-data')
    const cycle = {
      product: reagentData,
      reagents: [
        { ...data.product, quantity: 1 },
        { wowheadItemId: 3, name: 'Новый', iconUrl: '', quantity: 1 },
      ],
      outputQuantity: 1,
      profession: data.profession,
    }
    expect(store.importRecipe(cycle).success).toBe(false)
    expect(useCraftStore.getState()).toBe(before)
    expect(localStorage.getItem('craft-calc-versioned-data')).toBe(saved)
    const extra = store.addReferenceItem({
      wowheadItemId: 3,
      name: 'Дополнительный',
      iconUrl: '',
    })
    if (!extra.success) throw new Error(extra.error)
    store.setRecipe(reagentId, {
      outputQuantity: 2,
      profession: 'tailoring',
      reagents: [{ itemId: extra.itemId, quantity: 1, acquisition: 'buy' }],
    })
    const nested =
      useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items[
        reagentId
      ]?.recipe
    store.importRecipe(data)
    expect(
      useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items[
        reagentId
      ]?.recipe,
    ).toBe(nested)
  })
})
