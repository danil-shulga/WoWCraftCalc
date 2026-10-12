import { GAME_VERSIONS } from '../domain/game-version'
import { getCraftUnitCost } from '../domain/calculations'
import { selectActiveItems, selectActiveProfessions } from './craft.selectors'
import { createEmptyCraftData } from './persistence'
import { useCraftStore } from './useCraftStore'
import { readFileSync } from 'node:fs'
import { GAME_VERSION_REGISTRY } from '../domain/game-version'
import { parseReferenceDatabase } from '../domain/reference-database.schema'
import { referenceRecipeToImport } from '../domain/reference-database-import'
import { createExportJson, parseImportedData, STORAGE_KEY } from './persistence'

beforeEach(() => {
  useCraftStore.getState().replaceData(createEmptyCraftData())
})

it('изолирует одинаковые ID, цены, рецепты, удаление и профессии', () => {
  const data = createEmptyCraftData()
  for (const [index, version] of GAME_VERSIONS.entries()) {
    data.workspaces[version].items = {
      reagent: {
        id: 'reagent',
        name: 'Ткань',
        iconUrl: '',
        sections: ['reagents'],
        purchasePriceCopper: 10 * (index + 1),
        salePriceCopper: null,
        recipe: null,
      },
      product: {
        id: 'product',
        name: 'Рулон',
        iconUrl: '',
        sections: ['crafts'],
        purchasePriceCopper: null,
        salePriceCopper: 100,
        recipe: {
          outputQuantity: index + 1,
          profession: 'tailoring',
          reagents: [{ itemId: 'reagent', quantity: 3, acquisition: 'buy' }],
        },
      },
    }
  }
  useCraftStore.getState().replaceData(data)
  const other = useCraftStore.getState().workspaces.tbc
  useCraftStore.getState().setItemPrice('reagent', 'purchasePriceCopper', 50)
  useCraftStore.getState().setProfessionOwned('tailoring', true)
  expect(getCraftUnitCost(selectActiveItems(useCraftStore.getState()), 'product')).toBe(
    150,
  )
  useCraftStore.getState().removeItem('reagent')
  expect(selectActiveItems(useCraftStore.getState()).product?.recipe).toBeNull()
  expect(useCraftStore.getState().workspaces.tbc).toBe(other)
  useCraftStore.getState().setActiveVersion('tbc')
  expect(selectActiveProfessions(useCraftStore.getState())).toEqual([])
  expect(getCraftUnitCost(selectActiveItems(useCraftStore.getState()), 'product')).toBe(
    30,
  )
  expect(
    useCraftStore.getState().workspaces.classic.items.reagent?.purchasePriceCopper,
  ).toBe(30)
})

it('отклоняет чужое происхождение, смешанный импорт и ответ после переключения туда и обратно', () => {
  const store = useCraftStore.getState()
  const expected = { version: store.activeVersion, revision: store.workspaceRevision }
  const item = {
    wowheadItemId: 1,
    wowheadVersion: 'forever' as const,
    name: 'Предмет',
    iconUrl: '',
  }
  expect(store.addReferenceItem({ ...item, wowheadVersion: 'classic' }).success).toBe(
    false,
  )
  expect(
    store.importRecipe({
      product: item,
      reagents: [{ ...item, wowheadItemId: 2, wowheadVersion: 'tbc', quantity: 1 }],
      outputQuantity: 1,
      profession: null,
    }).success,
  ).toBe(false)
  store.setActiveVersion('tbc')
  store.setActiveVersion('forever')
  expect(store.addReferenceItem(item, expected).success).toBe(false)
  expect(selectActiveItems(useCraftStore.getState())).toEqual({})
  const before = useCraftStore.getState()
  store.setActiveVersion('forever')
  expect(useCraftStore.getState()).toBe(before)
})

it('добавляет один реальный предмет во все базы, сохраняет разные цены/выход, перезагружает и восстанавливает полную копию', async () => {
  const ids = new Map<string, string>()
  for (const [index, version] of GAME_VERSIONS.entries()) {
    useCraftStore.getState().setActiveVersion(version)
    const value: unknown = JSON.parse(
      readFileSync(`public/${GAME_VERSION_REGISTRY[version].databasePath}`, 'utf8'),
    )
    const db = parseReferenceDatabase(value, version)
    const product = db.items['10041']
    const recipe = db.recipes[String(product?.recipeSpellIds[0])]
    if (!recipe) throw new Error(`Нет общего предмета в ${version}`)
    const result = useCraftStore
      .getState()
      .importRecipe(referenceRecipeToImport(db, recipe, index + 1))
    if (!result.success) throw new Error(result.error)
    ids.set(version, result.productItemId)
    useCraftStore
      .getState()
      .setItemPrice(result.productItemId, 'salePriceCopper', 100 * (index + 1))
    useCraftStore.getState().setProfessionOwned('tailoring', true)
  }
  const store = useCraftStore.getState()
  const backup = createExportJson(store)
  const saved = localStorage.getItem(STORAGE_KEY)
  useCraftStore.getState().replaceData(createEmptyCraftData())
  localStorage.setItem(STORAGE_KEY, saved ?? '')
  await useCraftStore.persist.rehydrate()
  expect(useCraftStore.getState().activeVersion).toBe('classic')
  const imported = parseImportedData(backup)
  if (!imported.success) throw new Error(imported.error)
  expect(useCraftStore.getState().replaceData(imported.data)).toBeNull()
  for (const [index, version] of GAME_VERSIONS.entries()) {
    const id = ids.get(version)
    if (!id) throw new Error('Нет ID')
    expect(useCraftStore.getState().workspaces[version].items[id]).toMatchObject({
      salePriceCopper: 100 * (index + 1),
      recipe: { outputQuantity: index + 1 },
      source: { wowheadVersion: GAME_VERSION_REGISTRY[version].wowheadVersion },
    })
    expect(useCraftStore.getState().workspaces[version].ownedProfessions).toEqual([
      'tailoring',
    ])
  }
})

it('отклоняет названия при изменении предмета или версии с момента загрузки', () => {
  const store = useCraftStore.getState()
  const result = store.addReferenceItem({
    name: 'Нефрит',
    wowheadItemId: 1529,
    wowheadVersion: 'forever',
    iconUrl: '',
  })
  if (!result.success) throw new Error(result.error)
  const expectedItem = selectActiveItems(useCraftStore.getState())[result.itemId]
  if (!expectedItem) throw new Error('Нет предмета')
  const update = {
    itemId: result.itemId,
    wowheadItemId: 1529,
    wowheadVersion: 'forever' as const,
    names: { ru: 'Нефрит', en: 'Jade' },
    expectedItem,
  }
  store.updateItem(result.itemId, { ...expectedItem, name: 'Мой нефрит' })
  expect(store.fillItemNames([update])).toContain('Каталог изменился')
  const request = {
    version: useCraftStore.getState().activeVersion,
    revision: useCraftStore.getState().workspaceRevision,
  }
  store.setActiveVersion('tbc')
  store.setActiveVersion('forever')
  expect(store.fillItemNames([update], request)).toContain('Версия игры изменилась')
  expect(selectActiveItems(useCraftStore.getState())[result.itemId]?.names?.en).toBeNull()
})
