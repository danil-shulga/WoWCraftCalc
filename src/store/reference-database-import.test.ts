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
const metadataFields = [
  'requiredLevel',
  'qualityId',
  'itemLevel',
  'classId',
  'subclassId',
  'inventoryType',
] as const

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
      requiredLevel: 70,
      qualityId: 3,
      itemLevel: 85,
      classId: 4,
      subclassId: 1,
      inventoryType: 1,
    })
    expect(
      useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items[
        reagentId
      ],
    ).toMatchObject({
      purchasePriceCopper: null,
      salePriceCopper: null,
      requiredLevel: 0,
      qualityId: 1,
      itemLevel: 5,
      classId: 7,
      subclassId: 0,
      inventoryType: 0,
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
    expect(useCraftStore.getState().workspaces.forever.items[productId]).toMatchObject({
      requiredLevel: 70,
      qualityId: 3,
      itemLevel: 85,
      classId: 4,
      subclassId: 1,
      inventoryType: 1,
    })
    expect(useCraftStore.getState().workspaces.forever.items[reagentId]).toMatchObject({
      requiredLevel: 0,
      qualityId: 1,
      itemLevel: 5,
      classId: 7,
      subclassId: 0,
      inventoryType: 0,
    })
  })
  it.each(metadataFields)(
    'дополняет %s у старых предметов, обновляет нулём и сохраняет при неизвестном значении',
    (field) => {
      const store = useCraftStore.getState()
      const legacyProduct = { ...data.product }
      const legacyReagent = { ...reagentData }
      for (const key of metadataFields) {
        Reflect.deleteProperty(legacyProduct, key)
        Reflect.deleteProperty(legacyReagent, key)
      }
      const added = store.addReferenceItem(legacyReagent)
      const imported = store.importRecipe({
        ...data,
        product: legacyProduct,
        reagents: [{ ...legacyReagent, quantity: 3 }],
      })
      if (!added.success || !imported.success) throw new Error('Импорт не выполнен')
      expect(store.importRecipe(data).success).toBe(true)
      expect(
        useCraftStore.getState().workspaces.forever.items[added.itemId]?.[field],
      ).toBe(reagentData[field])
      expect(
        useCraftStore.getState().workspaces.forever.items[imported.productItemId]?.[
          field
        ],
      ).toBe(data.product[field])
      const zeroData = {
        ...data,
        product: { ...data.product, [field]: 0 },
        reagents: [{ ...reagentData, [field]: 0, quantity: 3 }],
      }
      expect(store.importRecipe(zeroData).success).toBe(true)
      for (const unknown of [undefined, null]) {
        const product = { ...data.product }
        const reagent = { ...reagentData }
        if (unknown === undefined) {
          Reflect.deleteProperty(product, field)
          Reflect.deleteProperty(reagent, field)
        } else {
          product[field] = unknown
          reagent[field] = unknown
        }
        expect(
          store.importRecipe({
            ...data,
            product,
            reagents: [{ ...reagent, quantity: 3 }],
          }).success,
        ).toBe(true)
        expect(store.addReferenceItem(reagent).success).toBe(true)
        expect(store.addReferenceItem(product).success).toBe(true)
        for (const id of [added.itemId, imported.productItemId]) {
          expect(useCraftStore.getState().workspaces.forever.items[id]?.[field]).toBe(0)
        }
      }
      expect(store.addReferenceItem({ ...reagentData, [field]: 12 }).success).toBe(true)
      expect(
        useCraftStore.getState().workspaces.forever.items[added.itemId]?.[field],
      ).toBe(12)
    },
  )
  it.each(metadataFields)(
    'атомарно отклоняет неверное поле %s при любом импорте',
    (field) => {
      const store = useCraftStore.getState()
      expect(store.importRecipe(data).success).toBe(true)
      for (const invalid of [-1, 1.5]) {
        const before = useCraftStore.getState()
        const saved = localStorage.getItem('craft-calc-versioned-data')
        expect(store.addReferenceItem({ ...reagentData, [field]: invalid }).success).toBe(
          false,
        )
        expect(
          store.importRecipe({ ...data, product: { ...data.product, [field]: invalid } })
            .success,
        ).toBe(false)
        expect(
          store.importRecipe({
            ...data,
            reagents: [{ ...reagentData, [field]: invalid, quantity: 3 }],
          }).success,
        ).toBe(false)
        expect(useCraftStore.getState()).toBe(before)
        expect(localStorage.getItem('craft-calc-versioned-data')).toBe(saved)
      }
    },
  )
  it('дополняет метаданные из базы и сохраняет их при импорте без этих сведений', () => {
    const store = useCraftStore.getState()
    const added = store.addReferenceItem(reagentData)
    if (!added.success) throw new Error(added.error)
    expect(useCraftStore.getState().workspaces.forever.items[added.itemId]).toMatchObject(
      { requiredLevel: 0, qualityId: 1 },
    )
    const withoutMetadata = { ...reagentData }
    delete withoutMetadata.requiredLevel
    delete withoutMetadata.qualityId
    store.addReferenceItem(withoutMetadata)
    store.importRecipe({ ...data, reagents: [{ ...withoutMetadata, quantity: 3 }] })
    expect(useCraftStore.getState().workspaces.forever.items[added.itemId]).toMatchObject(
      { requiredLevel: 0, qualityId: 1 },
    )
    for (const invalid of [-1, 1.5]) {
      const before = useCraftStore.getState()
      expect(
        store.addReferenceItem({ ...reagentData, requiredLevel: invalid }).success,
      ).toBe(false)
      expect(
        store.importRecipe({ ...data, product: { ...data.product, qualityId: invalid } })
          .success,
      ).toBe(false)
      expect(useCraftStore.getState()).toBe(before)
    }
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
