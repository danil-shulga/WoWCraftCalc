import type { GameVersion } from '../domain/game-version'
import { GAME_VERSION_REGISTRY } from '../domain/game-version'
import type {
  RecipeImportData,
  RecipeImportItem,
  ReferenceImportEntry,
} from '../domain/recipe-import.types'
import { createExportJson, parseImportedData, STORAGE_KEY } from './persistence'
import { useCraftStore } from './useCraftStore'

const material: RecipeImportItem = {
  wowheadItemId: 2,
  name: 'Ткань',
  iconUrl: '',
  wowheadVersion: 'forever',
  qualityId: 1,
}
const crown: RecipeImportData = {
  product: {
    wowheadItemId: 1,
    name: 'Венец',
    iconUrl: '',
    wowheadVersion: 'forever',
    qualityId: 3,
  },
  reagents: [{ ...material, quantity: 3 }],
  outputQuantity: 1,
  profession: 'tailoring',
}
const bolt: RecipeImportData = {
  ...crown,
  product: { ...crown.product, wowheadItemId: 3, name: 'Рулон' },
  outputQuantity: 2,
}
const request = () => ({
  version: useCraftStore.getState().activeVersion,
  revision: useCraftStore.getState().workspaceRevision,
})
const recipeEntry = (data: RecipeImportData): ReferenceImportEntry => ({
  kind: 'recipe',
  data,
})
const itemEntry = (item: RecipeImportItem): ReferenceImportEntry => ({
  kind: 'item',
  item,
})
const items = () =>
  useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items
const bySource = (id: number) => {
  const item = Object.values(items()).find((item) => item.source?.wowheadItemId === id)
  if (!item) throw new Error(`Нет предмета ${String(id)}`)
  return item
}
const add = (
  entries: ReferenceImportEntry[],
  section: 'crafts' | 'reagents' | 'disenchanting' = 'crafts',
) => useCraftStore.getState().importReferenceBatch(entries, request(), section)

beforeEach(() => {
  useCraftStore.getState().resetData()
})
afterEach(() => {
  vi.restoreAllMocks()
})

it('добавляет два рецепта с общим материалом одним обновлением и записью', () => {
  const listener = vi.fn()
  const unsubscribe = useCraftStore.subscribe(listener)
  const write = vi.spyOn(Storage.prototype, 'setItem')
  expect(add([recipeEntry(crown), recipeEntry(bolt)])).toEqual({
    success: true,
    created: 3,
    reused: 0,
    recipes: 2,
  })
  expect(Object.keys(items())).toHaveLength(3)
  expect(listener).toHaveBeenCalledTimes(1)
  expect(write).toHaveBeenCalledTimes(1)
  expect(bySource(1).recipe?.reagents[0]?.itemId).toBe(
    bySource(3).recipe?.reagents[0]?.itemId,
  )
  unsubscribe()
  expect(add([recipeEntry(crown), recipeEntry(bolt)])).toEqual({
    success: true,
    created: 0,
    reused: 3,
    recipes: 2,
  })
})

it.each([false, true])(
  'сохраняет выбранный рецепт продукта, используемого как реагент, порядок: %s',
  (reverse) => {
    const entries = [
      recipeEntry({ ...crown, reagents: [{ ...bolt.product, quantity: 1 }] }),
      recipeEntry(bolt),
      itemEntry(material),
    ]
    expect(add(reverse ? entries.reverse() : entries, 'disenchanting').success).toBe(true)
    expect(bySource(3).sections).toEqual(
      expect.arrayContaining(['crafts', 'reagents', 'disenchanting']),
    )
    expect(bySource(2).sections).toEqual(
      expect.arrayContaining(['reagents', 'disenchanting']),
    )
    expect(bySource(3)).toMatchObject({
      recipe: { outputQuantity: 2 },
    })
    expect(bySource(2)).toMatchObject({
      recipe: null,
    })
  },
)

it('сохраняет цены, источники, избранное, вложенный рецепт и выбор получения', () => {
  expect(
    add([
      recipeEntry(crown),
      recipeEntry({ ...bolt, reagents: [{ ...crown.product, quantity: 1 }] }),
    ]).success,
  ).toBe(true)
  const store = useCraftStore.getState()
  const product = bySource(1)
  store.updateItem(product.id, {
    ...product,
    purchasePriceCopper: 0,
    salePriceCopper: 42,
    purchasePriceSource: 'tsm',
    salePriceSource: 'manual',
  })
  store.setItemFavorite(product.id, true)
  store.setAcquisition(product.id, bySource(2).id, 'buy')
  const nested = bySource(1).recipe
  expect(
    add(
      [
        itemEntry(crown.product),
        recipeEntry({ ...bolt, reagents: [{ ...crown.product, quantity: 1 }] }),
      ],
      'reagents',
    ).success,
  ).toBe(true)
  expect(bySource(1)).toMatchObject({
    purchasePriceCopper: 0,
    salePriceCopper: 42,
    purchasePriceSource: 'tsm',
    isFavorite: true,
    recipe: nested,
  })
  expect(add([recipeEntry(crown)]).success).toBe(true)
  expect(bySource(1).recipe?.reagents[0]?.acquisition).toBe('buy')
})

it.each([false, true])(
  'проверяет конечный граф при замене нескольких рецептов, порядок: %s',
  (reverse) => {
    expect(
      add([
        recipeEntry(crown),
        recipeEntry({ ...bolt, reagents: [{ ...crown.product, quantity: 1 }] }),
      ]).success,
    ).toBe(true)
    const entries = [
      recipeEntry({ ...crown, reagents: [{ ...bolt.product, quantity: 1 }] }),
      recipeEntry(bolt),
    ]
    expect(add(reverse ? entries.reverse() : entries).success).toBe(true)
    expect(bySource(1).recipe?.reagents[0]?.itemId).toBe(bySource(3).id)
    expect(bySource(3).recipe?.reagents[0]?.itemId).toBe(bySource(2).id)
  },
)

it.each([
  [
    'цикл',
    () => [
      recipeEntry({ ...crown, reagents: [{ ...bolt.product, quantity: 1 }] }),
      recipeEntry({ ...bolt, reagents: [{ ...crown.product, quantity: 1 }] }),
    ],
  ],
  [
    'неверный выход последнего',
    () => [recipeEntry(crown), recipeEntry({ ...bolt, outputQuantity: 0 })],
  ],
  ['повтор продукта', () => [recipeEntry(crown), recipeEntry(crown)]],
  [
    'повтор реагента',
    () => [recipeEntry({ ...crown, reagents: [...crown.reagents, ...crown.reagents] })],
  ],
  [
    'собственный результат',
    () => [recipeEntry({ ...crown, reagents: [{ ...crown.product, quantity: 1 }] })],
  ],
  [
    'чужая версия',
    () => [recipeEntry(crown), itemEntry({ ...material, wowheadVersion: 'classic' })],
  ],
  ['пустой набор', () => []],
  ['крафт без рецепта', () => [itemEntry(crown.product)]],
] satisfies [string, () => ReferenceImportEntry[]][])(
  'отклоняет %s без частичных изменений',
  (_, entries) => {
    const before = useCraftStore.getState()
    const saved = localStorage.getItem(STORAGE_KEY)
    expect(add(entries()).success).toBe(false)
    expect(useCraftStore.getState()).toBe(before)
    expect(localStorage.getItem(STORAGE_KEY)).toBe(saved)
  },
)

it('отклоняет неоднозначность и конфликт разных источников с одним ручным предметом', () => {
  const store = useCraftStore.getState()
  const input = {
    name: 'Венец',
    iconUrl: '',
    sections: ['crafts' as const],
    purchasePriceCopper: null,
    salePriceCopper: null,
  }
  store.createItem(input)
  const before = useCraftStore.getState()
  const conflict = add([
    recipeEntry(crown),
    recipeEntry({ ...bolt, product: { ...bolt.product, name: 'Венец' } }),
  ])
  expect(conflict.success).toBe(false)
  if (!conflict.success) expect(conflict.error).toContain('одним предметом')
  expect(useCraftStore.getState()).toBe(before)
  store.createItem(input)
  const ambiguous = useCraftStore.getState()
  const result = add([recipeEntry(crown)])
  expect(result.success).toBe(false)
  if (!result.success) expect(result.error).toContain('Неоднозначное')
  expect(useCraftStore.getState()).toBe(ambiguous)
})

it('отклоняет запрос после смены версии туда и обратно или сброса workspace', () => {
  const expected = request()
  useCraftStore.getState().setActiveVersion('tbc')
  useCraftStore.getState().setActiveVersion('forever')
  expect(
    useCraftStore
      .getState()
      .importReferenceBatch([recipeEntry(crown)], expected, 'crafts').success,
  ).toBe(false)
  const resetRequest = request()
  useCraftStore.getState().resetData()
  expect(
    useCraftStore
      .getState()
      .importReferenceBatch([recipeEntry(crown)], resetRequest, 'crafts').success,
  ).toBe(false)
  expect(items()).toEqual({})
})

it.each(['classic', 'tbc', 'forever'] satisfies GameVersion[])(
  'восстанавливает пакет %s через persistence и backup с изоляцией версий',
  async (version) => {
    const store = useCraftStore.getState()
    store.setActiveVersion(version)
    const wowheadVersion = GAME_VERSION_REGISTRY[version].wowheadVersion
    const data = {
      ...crown,
      product: { ...crown.product, wowheadVersion },
      reagents: crown.reagents.map((item) => ({ ...item, wowheadVersion })),
    }
    expect(add([recipeEntry(data)]).success).toBe(true)
    const saved = localStorage.getItem(STORAGE_KEY)
    const backup = parseImportedData(createExportJson(useCraftStore.getState()))
    expect(backup.success).toBe(true)
    store.resetData()
    localStorage.setItem(STORAGE_KEY, saved ?? '')
    await useCraftStore.persist.rehydrate()
    expect(Object.keys(items())).toHaveLength(2)
    if (!backup.success) throw new Error(backup.error)
    expect(store.replaceData(backup.data)).toBeNull()
    expect(bySource(1)).toMatchObject({ qualityId: 3, recipe: { outputQuantity: 1 } })
    for (const other of ['classic', 'tbc', 'forever'] satisfies GameVersion[])
      if (other !== version)
        expect(useCraftStore.getState().workspaces[other].items).toEqual({})
  },
)

it('сообщает об отказе localStorage вместо успеха', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Нет места')
  })
  expect(add([recipeEntry(crown)])).toEqual({ success: false, error: 'Нет места' })
})
