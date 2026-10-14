import { create } from 'zustand'
import { tsmSettingsSchema } from '../domain/tsm'
import type { TsmSettings } from '../domain/tsm'
import { persist } from 'zustand/middleware'
import { z } from 'zod'

import { getItemSearchNames, normalizeItemName } from '../domain/item-names'
import { itemNamesSchema, itemSchema, recipeSchema } from '../domain/item.schema'
import { GAME_VERSION_REGISTRY } from '../domain/game-version'
import type { GameVersion } from '../domain/game-version'
import { selectActiveWorkspace } from './craft.selectors'

import { getRecipeValidationError } from '../domain/recipe-validation'
import type {
  AcquisitionMethod,
  Item,
  ItemCatalog,
  ItemId,
  ItemNames,
  ItemNamesUpdate,
  ItemPriceField,
  ItemSection,
  PersistedCraftData,
  Recipe,
  VersionWorkspace,
} from '../domain/item.types'
import { PROFESSION_IDS, type Profession } from '../domain/professions'
import {
  WOWHEAD_VERSIONS,
  type CurrencyDisplayMode,
  type ItemLanguage,
  type WowheadVersion,
} from '../domain/user-settings'
import {
  createCraftStorage,
  createEmptyCraftData,
  STORAGE_KEY,
  STORAGE_VERSION,
  parseCurrentPersistedData,
} from './persistence'

export type ItemInput = Omit<Item, 'id' | 'recipe' | 'isFavorite'>

export interface RecipeImportTarget {
  itemId: ItemId
  input: ItemInput
}

export interface RecipeImportItem {
  wowheadItemId: number
  name: string
  names?: ItemNames | undefined
  wowheadVersion?: WowheadVersion | undefined
  iconUrl: string
  defaultPurchasePriceCopper?: number | null | undefined
  defaultSalePriceCopper?: number | null | undefined
}

export interface RecipeImportData {
  product: RecipeImportItem
  reagents: (RecipeImportItem & { quantity: number })[]
  outputQuantity: number
  profession: Profession | null
  productSection?: ItemSection | undefined
}

const recipeImportItemSchema = z.object({
  wowheadItemId: z.number().int().positive(),
  name: z.string().trim().min(1),
  names: itemNamesSchema.optional(),
  wowheadVersion: z.enum(WOWHEAD_VERSIONS).optional(),
  iconUrl: z.union([z.literal(''), z.url()]),
  defaultPurchasePriceCopper: z.number().int().nonnegative().nullable().optional(),
  defaultSalePriceCopper: z.number().int().nonnegative().nullable().optional(),
})

const recipeImportSchema = z.object({
  product: recipeImportItemSchema,
  reagents: z
    .array(recipeImportItemSchema.extend({ quantity: z.number().int().positive() }))
    .min(1),
  outputQuantity: z.number().int().positive(),
  profession: z.enum(PROFESSION_IDS).nullable(),
  productSection: z.enum(['crafts', 'reagents']).optional(),
})

export type RecipeImportResult =
  | {
      success: true
      productItemId: ItemId
      productCreated: boolean
      reagentsCreated: number
    }
  | { success: false; error: string }

export type ReferenceItemAddResult =
  { success: true; itemId: ItemId; created: boolean } | { success: false; error: string }

export interface WorkspaceRequest {
  version: GameVersion
  revision: number
}

interface CraftStore extends PersistedCraftData {
  setTbcPricing: (settings: TsmSettings) => void
  workspaceRevision: number
  setActiveVersion: (version: GameVersion) => void
  createItem: (input: ItemInput) => ItemId
  updateItem: (itemId: ItemId, input: ItemInput) => void
  saveItemEdit: (
    itemId: ItemId,
    input: ItemInput,
    recipe: Recipe | null,
    expected?: WorkspaceRequest,
  ) => string | null
  setItemPrice: (itemId: ItemId, field: ItemPriceField, value: number | null) => void
  setItemPrices: (
    field: ItemPriceField,
    prices: Readonly<Record<ItemId, number | null>>,
  ) => void
  removeItem: (itemId: ItemId) => void
  setItemFavorite: (itemId: ItemId, isFavorite: boolean) => void
  setRecipe: (itemId: ItemId, recipe: Recipe | null) => string | null
  setAcquisition: (
    ownerItemId: ItemId,
    reagentItemId: ItemId,
    acquisition: AcquisitionMethod,
  ) => void
  importRecipe: (
    data: RecipeImportData,
    expected?: WorkspaceRequest,
    target?: RecipeImportTarget,
  ) => RecipeImportResult
  addReferenceItem: (
    data: RecipeImportItem,
    expected?: WorkspaceRequest,
  ) => ReferenceItemAddResult
  replaceData: (data: PersistedCraftData) => string | null
  resetData: () => string | null
  setProfessionOwned: (profession: Profession, owned: boolean) => void
  setCurrencyDisplay: (mode: CurrencyDisplayMode) => void
  setItemLanguage: (language: ItemLanguage) => void
  fillItemNames: (
    updates: readonly ItemNamesUpdate[],
    expected?: WorkspaceRequest,
  ) => string | null
}

interface PersistenceStatusStore {
  hydrationError: string | null
  recoveryRequired: boolean
  setHydrationError: (error: string | null) => void
  setWriteError: (error: string | null) => void
}

export const usePersistenceStatusStore = create<PersistenceStatusStore>((set) => ({
  hydrationError: null,
  recoveryRequired: false,
  setWriteError: (hydrationError) => {
    set({ hydrationError })
  },
  setHydrationError: (hydrationError) => {
    set({ hydrationError, recoveryRequired: hydrationError !== null })
  },
}))

const craftStorage = createCraftStorage(
  (error) => {
    usePersistenceStatusStore.getState().setWriteError(getPersistenceError(error))
  },
  () => {
    const status = usePersistenceStatusStore.getState()
    if (!status.recoveryRequired && status.hydrationError) status.setWriteError(null)
  },
)
const storageKey = STORAGE_KEY
const storageVersion = STORAGE_VERSION

function mergeItemNames(
  current: Item | undefined,
  imported: RecipeImportItem,
): ItemNames {
  return {
    ru: imported.names?.ru ?? current?.names?.ru ?? null,
    en: imported.names?.en ?? current?.names?.en ?? null,
  }
}

function getPersistenceError(error: unknown): string {
  return error instanceof Error ? error.message : 'Не удалось сохранить данные CraftCalc'
}

function findImportedItemCandidates(
  items: ItemCatalog,
  importedItem: RecipeImportItem,
  excludedIds: ReadonlySet<ItemId> = new Set(),
): Item[] {
  const candidates = Object.values(items).filter((item) => !excludedIds.has(item.id))
  const compatibleSource = (item: Item) =>
    item.source?.wowheadVersion === undefined ||
    importedItem.wowheadVersion === undefined ||
    item.source.wowheadVersion === importedItem.wowheadVersion
  const sourceMatches = candidates.filter(
    (item) =>
      !excludedIds.has(item.id) &&
      item.source?.wowheadItemId === importedItem.wowheadItemId &&
      compatibleSource(item),
  )

  if (sourceMatches.length > 0) {
    return sourceMatches
  }

  const importedNames = new Set(getItemSearchNames(importedItem).map(normalizeItemName))
  const nameMatches = candidates.filter(
    (item) =>
      compatibleSource(item) &&
      (item.source === undefined ||
        item.source.wowheadItemId === importedItem.wowheadItemId) &&
      getItemSearchNames(item).some((name) => importedNames.has(normalizeItemName(name))),
  )

  return nameMatches
}

export function findImportedItem(
  items: ItemCatalog,
  importedItem: RecipeImportItem,
  excludedIds: ReadonlySet<ItemId> = new Set(),
): Item | undefined {
  const matches = findImportedItemCandidates(items, importedItem, excludedIds)
  return matches.length === 1 ? matches[0] : undefined
}

function getImportAmbiguityError(
  items: ItemCatalog,
  importedItem: RecipeImportItem,
): string | null {
  return findImportedItemCandidates(items, importedItem).length > 1
    ? `Неоднозначное сопоставление «${importedItem.name}»: несколько предметов в каталоге. Уточните названия или источники перед импортом.`
    : null
}

export const useCraftStore = create<CraftStore>()(
  persist<CraftStore, [], [], PersistedCraftData>(
    (setState, getState) => {
      const get = () => selectActiveWorkspace(getState())
      const set = (
        update:
          | Partial<VersionWorkspace>
          | ((workspace: VersionWorkspace) => Partial<VersionWorkspace>),
      ) => {
        setState((state) => {
          const current = selectActiveWorkspace(state)
          const patch = typeof update === 'function' ? update(current) : update
          if (patch === current) return state
          return {
            workspaces: {
              ...state.workspaces,
              [state.activeVersion]: { ...current, ...patch },
            },
          }
        })
      }
      const requestIsCurrent = (expected?: WorkspaceRequest) =>
        !expected ||
        (expected.version === getState().activeVersion &&
          expected.revision === getState().workspaceRevision)
      const importIsCompatible = (items: readonly RecipeImportItem[]) =>
        items.every(
          (item) =>
            item.wowheadVersion === undefined ||
            item.wowheadVersion ===
              GAME_VERSION_REGISTRY[getState().activeVersion].wowheadVersion,
        )
      return {
        ...createEmptyCraftData(),
        workspaceRevision: 0,
        setTbcPricing: (settings) => {
          const parsed = tsmSettingsSchema.parse(settings)
          setState({ tbcPricing: parsed })
        },
        setActiveVersion: (activeVersion) => {
          if (activeVersion !== getState().activeVersion)
            setState({
              activeVersion,
              workspaceRevision: getState().workspaceRevision + 1,
            })
        },

        createItem: (input) => {
          const itemId = crypto.randomUUID()
          const item = {
            ...input,
            names: input.names ?? { ru: null, en: null },
            id: itemId,
            recipe: null,
          }

          set((state) => ({
            items: {
              ...state.items,
              [itemId]: item,
            },
          }))

          return itemId
        },

        updateItem: (itemId, input) => {
          set((state) => {
            const currentItem = state.items[itemId]

            if (currentItem === undefined) {
              return state
            }

            return {
              items: {
                ...state.items,
                [itemId]: {
                  ...currentItem,
                  ...input,
                  names: input.names ?? currentItem.names ?? { ru: null, en: null },
                  id: itemId,
                  recipe: currentItem.recipe,
                },
              },
            }
          })
        },

        saveItemEdit: (itemId, input, recipe, expected) => {
          if (!requestIsCurrent(expected))
            return 'Версия игры изменилась. Откройте редактор заново'
          const { items } = get()
          const current = items[itemId]
          if (current === undefined) return 'Предмет не найден'
          const parsed = itemSchema.safeParse({
            ...current,
            ...input,
            id: itemId,
            recipe,
          })
          if (!parsed.success) return 'Проверьте описание, количества и состав рецепта'
          if (recipe !== null) {
            if (
              recipe.profession &&
              !GAME_VERSION_REGISTRY[getState().activeVersion].professions.includes(
                recipe.profession,
              )
            )
              return 'Профессия недоступна в этой версии игры'
            const error = getRecipeValidationError(items, itemId, recipe.reagents)
            if (error !== null) return error
          }
          set({ items: { ...items, [itemId]: parsed.data } })
          return null
        },

        setItemPrice: (itemId, field, value) => {
          set((state) => {
            const item = state.items[itemId]

            if (item === undefined) {
              return state
            }

            return {
              items: {
                ...state.items,
                [itemId]: {
                  ...item,
                  [field]: value,
                },
              },
            }
          })
        },

        setItemPrices: (field, prices) => {
          const { items } = get()
          let nextItems: ItemCatalog | undefined

          for (const [itemId, value] of Object.entries(prices)) {
            const item = items[itemId]

            if (item === undefined || item[field] === value) {
              continue
            }

            nextItems ??= { ...items }
            nextItems[itemId] = { ...item, [field]: value }
          }

          if (nextItems !== undefined) {
            set({ items: nextItems })
          }
        },

        setItemFavorite: (itemId, isFavorite) => {
          set((state) => {
            const item = state.items[itemId]
            if (item === undefined || (item.isFavorite ?? false) === isFavorite) {
              return state
            }
            return {
              items: { ...state.items, [itemId]: { ...item, isFavorite } },
            }
          })
        },

        removeItem: (itemId) => {
          set((state) => {
            const items = Object.fromEntries(
              Object.entries(state.items)
                .filter(([id]) => id !== itemId)
                .map(([id, item]) => [
                  id,
                  item.recipe === null
                    ? item
                    : (() => {
                        const reagents = item.recipe.reagents.filter(
                          (line) => line.itemId !== itemId,
                        )

                        return {
                          ...item,
                          recipe:
                            reagents.length === 0 ? null : { ...item.recipe, reagents },
                        }
                      })(),
                ]),
            )

            return { items }
          })
        },

        setRecipe: (itemId, recipe) => {
          const { items } = get()

          if (items[itemId] === undefined) {
            return 'Предмет не найден'
          }

          if (recipe !== null) {
            if (!recipeSchema.safeParse(recipe).success)
              return 'Добавьте хотя бы один реагент или исправьте рецепт'
            if (
              recipe.profession &&
              !GAME_VERSION_REGISTRY[getState().activeVersion].professions.includes(
                recipe.profession,
              )
            )
              return 'Профессия недоступна в этой версии игры'
            const validationError = getRecipeValidationError(
              items,
              itemId,
              recipe.reagents,
            )

            if (validationError !== null) {
              return validationError
            }
          }

          set((state) => {
            const item = state.items[itemId]

            if (item === undefined) {
              return state
            }

            return {
              items: {
                ...state.items,
                [itemId]: {
                  ...item,
                  recipe,
                },
              },
            }
          })

          return null
        },

        setAcquisition: (ownerItemId, reagentItemId, acquisition) => {
          set((state) => {
            const owner = state.items[ownerItemId]

            if (owner?.recipe === undefined || owner.recipe === null) {
              return state
            }

            return {
              items: {
                ...state.items,
                [ownerItemId]: {
                  ...owner,
                  recipe: {
                    ...owner.recipe,
                    reagents: owner.recipe.reagents.map((line) =>
                      line.itemId === reagentItemId ? { ...line, acquisition } : line,
                    ),
                  },
                },
              },
            }
          })
        },

        importRecipe: (data, expected, target) => {
          if (!requestIsCurrent(expected))
            return { success: false, error: 'Версия игры изменилась. Повторите импорт' }
          if (!importIsCompatible([data.product, ...data.reagents]))
            return {
              success: false,
              error: 'Версия источника не совпадает с текущей версией игры',
            }
          if (
            data.profession &&
            !GAME_VERSION_REGISTRY[getState().activeVersion].professions.includes(
              data.profession,
            )
          )
            return { success: false, error: 'Профессия недоступна в этой версии игры' }
          const parsed = recipeImportSchema.safeParse(data)
          if (!parsed.success) {
            return {
              success: false,
              error: 'Некорректные данные импорта: проверьте состав, выход и профессию',
            }
          }
          data = parsed.data
          const currentItems = get().items
          const targetItem =
            target === undefined ? undefined : currentItems[target.itemId]
          if (target !== undefined) {
            if (targetItem === undefined)
              return { success: false, error: 'Предмет не найден' }
            if (
              targetItem.source !== undefined &&
              (targetItem.source.wowheadItemId !== data.product.wowheadItemId ||
                (targetItem.source.wowheadVersion !== undefined &&
                  targetItem.source.wowheadVersion !==
                    GAME_VERSION_REGISTRY[getState().activeVersion].wowheadVersion))
            )
              return {
                success: false,
                error:
                  'Этот рецепт создаёт другой предмет. Выберите рецепт редактируемого предмета',
              }
            const matched = findImportedItem(currentItems, data.product)
            if (matched !== undefined && matched.id !== target.itemId)
              return {
                success: false,
                error: 'Результат этого рецепта уже связан с другим предметом в каталоге',
              }
            if (
              !itemSchema.omit({ id: true, recipe: true }).safeParse(target.input).success
            )
              return { success: false, error: 'Проверьте описание предмета' }
          }
          const reagentSourceIds = new Set<number>()
          for (const imported of [data.product, ...data.reagents]) {
            const ambiguity = getImportAmbiguityError(currentItems, imported)
            if (ambiguity !== null) return { success: false, error: ambiguity }
          }
          for (const reagent of data.reagents) {
            if (
              reagent.wowheadItemId === data.product.wowheadItemId ||
              reagentSourceIds.has(reagent.wowheadItemId)
            ) {
              return {
                success: false,
                error:
                  'Рецепт содержит повтор реагента или ссылку на собственный результат',
              }
            }
            reagentSourceIds.add(reagent.wowheadItemId)
          }
          const currentProduct =
            targetItem ?? findImportedItem(currentItems, data.product)
          const productItemId = currentProduct?.id ?? crypto.randomUUID()
          const productCreated = currentProduct === undefined
          const nextItems: ItemCatalog = { ...currentItems }
          const productSections = currentProduct?.sections ?? []
          const importedProduct: Item = {
            isFavorite: currentProduct?.isFavorite,
            id: productItemId,
            name: data.product.name,
            names: mergeItemNames(currentProduct, data.product),
            iconUrl:
              data.product.iconUrl.length > 0
                ? data.product.iconUrl
                : (currentProduct?.iconUrl ?? ''),
            source: {
              wowheadItemId: data.product.wowheadItemId,
              ...(data.product.wowheadVersion === undefined
                ? {}
                : { wowheadVersion: data.product.wowheadVersion }),
            },
            sections: [
              ...new Set([
                ...productSections,
                'crafts' as const,
                ...(data.productSection === 'reagents' ? ['reagents' as const] : []),
              ]),
            ],
            purchasePriceCopper: currentProduct
              ? currentProduct.purchasePriceCopper
              : (data.product.defaultPurchasePriceCopper ?? null),
            salePriceCopper: currentProduct
              ? currentProduct.salePriceCopper
              : (data.product.defaultSalePriceCopper ?? null),
            recipe: currentProduct?.recipe ?? null,
            ...(target === undefined
              ? {}
              : {
                  name: target.input.name,
                  names: target.input.names ??
                    currentProduct?.names ?? { ru: null, en: null },
                  iconUrl: target.input.iconUrl,
                  sections: target.input.sections,
                  purchasePriceCopper: target.input.purchasePriceCopper,
                  salePriceCopper: target.input.salePriceCopper,
                  purchasePriceSource: target.input.purchasePriceSource,
                  salePriceSource: target.input.salePriceSource,
                }),
          }
          nextItems[productItemId] = importedProduct

          const reagentLines: Recipe['reagents'] = []
          let reagentsCreated = 0

          for (const importedReagent of data.reagents) {
            const ambiguity = getImportAmbiguityError(nextItems, importedReagent)
            if (ambiguity !== null) return { success: false, error: ambiguity }
            const reagent = findImportedItem(
              nextItems,
              importedReagent,
              new Set([productItemId]),
            )
            const reagentItemId = reagent?.id ?? crypto.randomUUID()

            if (reagent === undefined) {
              reagentsCreated += 1
            }

            nextItems[reagentItemId] = {
              isFavorite: reagent?.isFavorite,
              id: reagentItemId,
              name: importedReagent.name,
              names: mergeItemNames(reagent, importedReagent),
              iconUrl:
                importedReagent.iconUrl.length > 0
                  ? importedReagent.iconUrl
                  : (reagent?.iconUrl ?? ''),
              source: {
                wowheadItemId: importedReagent.wowheadItemId,
                ...(importedReagent.wowheadVersion === undefined
                  ? {}
                  : { wowheadVersion: importedReagent.wowheadVersion }),
              },
              sections: [...new Set([...(reagent?.sections ?? []), 'reagents' as const])],
              purchasePriceCopper: reagent
                ? reagent.purchasePriceCopper
                : (importedReagent.defaultPurchasePriceCopper ?? null),
              salePriceCopper: reagent
                ? reagent.salePriceCopper
                : (importedReagent.defaultSalePriceCopper ?? null),
              recipe: reagent?.recipe ?? null,
            }

            const previousLine = currentProduct?.recipe?.reagents.find(
              (line) => line.itemId === reagentItemId,
            )
            reagentLines.push({
              itemId: reagentItemId,
              quantity: importedReagent.quantity,
              acquisition: previousLine?.acquisition ?? 'auto',
            })
          }

          const recipe: Recipe = {
            outputQuantity: data.outputQuantity,
            profession: data.profession,
            reagents: reagentLines,
          }
          const validationError = getRecipeValidationError(
            nextItems,
            productItemId,
            recipe.reagents,
          )

          if (validationError !== null) {
            return { success: false, error: validationError }
          }

          nextItems[productItemId] = { ...importedProduct, recipe }
          set({ items: nextItems })

          return {
            success: true,
            productItemId,
            productCreated,
            reagentsCreated,
          }
        },

        addReferenceItem: (data, expected) => {
          if (!requestIsCurrent(expected))
            return {
              success: false,
              error: 'Версия игры изменилась. Повторите добавление',
            }
          if (!importIsCompatible([data]))
            return {
              success: false,
              error: 'Версия источника не совпадает с текущей версией игры',
            }
          const parsed = recipeImportItemSchema.safeParse(data)
          if (!parsed.success)
            return { success: false, error: 'Некорректные данные предмета из базы' }
          data = parsed.data
          const items = get().items
          const ambiguity = getImportAmbiguityError(items, data)
          if (ambiguity !== null) return { success: false, error: ambiguity }
          const current = findImportedItem(items, data)
          const itemId = current?.id ?? crypto.randomUUID()
          const item: Item = {
            id: itemId,
            name: data.name,
            names: mergeItemNames(current, data),
            iconUrl: data.iconUrl.length > 0 ? data.iconUrl : (current?.iconUrl ?? ''),
            source: {
              wowheadItemId: data.wowheadItemId,
              ...(data.wowheadVersion === undefined
                ? {}
                : { wowheadVersion: data.wowheadVersion }),
            },
            sections: [...new Set([...(current?.sections ?? []), 'reagents' as const])],
            purchasePriceCopper: current
              ? current.purchasePriceCopper
              : (data.defaultPurchasePriceCopper ?? null),
            salePriceCopper: current
              ? current.salePriceCopper
              : (data.defaultSalePriceCopper ?? null),
            recipe: current?.recipe ?? null,
          }
          set({ items: { ...items, [itemId]: item } })
          return { success: true, itemId, created: current === undefined }
        },

        replaceData: (data) => {
          try {
            craftStorage.replaceData(storageKey, data, storageVersion, (parsed) => {
              setState({ ...parsed, workspaceRevision: getState().workspaceRevision + 1 })
            })
            usePersistenceStatusStore.getState().setHydrationError(null)
            return null
          } catch (error) {
            return getPersistenceError(error)
          }
        },

        resetData: () => getState().replaceData(createEmptyCraftData()),

        setProfessionOwned: (profession, owned) => {
          if (
            !GAME_VERSION_REGISTRY[getState().activeVersion].professions.includes(
              profession,
            )
          )
            return
          set((state) => ({
            ownedProfessions: owned
              ? [...new Set([...state.ownedProfessions, profession])]
              : state.ownedProfessions.filter((current) => current !== profession),
          }))
        },

        setCurrencyDisplay: (currencyDisplay) => {
          setState({ currencyDisplay })
        },
        setItemLanguage: (itemLanguage) => {
          setState({ itemLanguage })
        },
        fillItemNames: (updates, expected) => {
          if (!requestIsCurrent(expected))
            return 'Версия игры изменилась. Загрузите названия повторно'
          if (
            !importIsCompatible(
              updates.map((update) => ({ ...update, name: update.itemId, iconUrl: '' })),
            )
          )
            return 'Версия источника не совпадает с текущей версией игры'
          const parsed = z
            .array(
              z.object({
                itemId: z.string().min(1),
                wowheadItemId: z.number().int().positive(),
                wowheadVersion: z.enum(WOWHEAD_VERSIONS),
                names: itemNamesSchema.refine(
                  (names) => names.ru !== null && names.en !== null,
                ),
              }),
            )
            .safeParse(updates)
          if (!parsed.success) return 'Не удалось проверить загруженные названия'
          const items = get().items
          const nextItems = { ...items }
          const seenIds = new Set<ItemId>()
          for (const update of parsed.data) {
            const item = items[update.itemId]
            const expectedItem = updates.find(
              (entry) => entry.itemId === update.itemId,
            )?.expectedItem
            if (
              (expectedItem !== undefined && expectedItem !== item) ||
              seenIds.has(update.itemId) ||
              item?.source?.wowheadItemId !== update.wowheadItemId ||
              (item.source.wowheadVersion !== undefined &&
                item.source.wowheadVersion !== update.wowheadVersion)
            ) {
              return 'Каталог изменился. Загрузите названия повторно'
            }
            seenIds.add(update.itemId)
            nextItems[update.itemId] = {
              ...item,
              names: {
                ru: item.names?.ru ?? update.names.ru,
                en: item.names?.en ?? update.names.en,
              },
              source: { ...item.source, wowheadVersion: update.wowheadVersion },
            }
          }
          if (parsed.data.length > 0) set({ items: nextItems })
          return null
        },
      }
    },
    {
      name: storageKey,
      storage: craftStorage,
      version: storageVersion,
      partialize: (state) => ({
        tbcPricing: state.tbcPricing,
        activeVersion: state.activeVersion,
        workspaces: state.workspaces,
        currencyDisplay: state.currencyDisplay,
        itemLanguage: state.itemLanguage,
      }),
      migrate: () => {
        throw new Error('Неподдерживаемая версия хранилища CraftCalc')
      },
      merge: (persistedState, currentState) =>
        persistedState === undefined
          ? currentState
          : {
              ...currentState,
              ...parseCurrentPersistedData(persistedState),
            },
      onRehydrateStorage: () => (_state, error) => {
        if (error !== undefined) {
          craftStorage.blockWrites()
          usePersistenceStatusStore
            .getState()
            .setHydrationError(
              error instanceof Error
                ? error.message
                : 'Не удалось загрузить сохранённые данные CraftCalc',
            )
        }
      },
    },
  ),
)
