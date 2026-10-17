import {
  findImportedItem,
  getImportAmbiguityError,
} from '../domain/imported-item-matching'
import type {
  RecipeImportData,
  RecipeImportItem,
  ReferenceImportEntry,
} from '../domain/recipe-import.types'
import { create } from 'zustand'
import { tsmSettingsSchema } from '../domain/tsm'
import type { TsmSettings } from '../domain/tsm'
import { persist } from 'zustand/middleware'
import { z } from 'zod'

import { isPlannerQuantity } from '../domain/planner'
import { itemNamesSchema, itemSchema, recipeSchema } from '../domain/item.schema'
import { GAME_VERSION_REGISTRY } from '../domain/game-version'
import type { GameVersion } from '../domain/game-version'
import { selectActiveWorkspace, selectItemsBySection } from './craft.selectors'

import { getRecipeValidationError } from '../domain/recipe-validation'
import type {
  AcquisitionMethod,
  Item,
  ItemCatalog,
  ItemId,
  ItemNamesUpdate,
  ItemPriceField,
  ItemSection,
  PersistedCraftData,
  Recipe,
  RootItemSection,
  VersionWorkspace,
} from '../domain/item.types'
import type { Profession } from '../domain/professions'
import {
  mergeImportedItem,
  prepareReferenceBatch,
  recipeImportItemSchema,
  recipeImportSchema,
  type ReferenceBatchResult,
} from './reference-import'
export type { ReferenceBatchResult } from './reference-import'
import {
  WOWHEAD_VERSIONS,
  type CurrencyDisplayMode,
  type ItemLanguage,
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
  setPlannerQuantity: (itemId: ItemId, quantity: number) => void
  removePlannerTarget: (itemId: ItemId) => void
  clearPlanner: () => void
  moveRootItem: (
    section: RootItemSection,
    itemId: ItemId,
    targetId: ItemId,
    position: 'before' | 'after',
  ) => void
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
    section?: ItemSection,
  ) => ReferenceItemAddResult
  importReferenceBatch: (
    entries: readonly ReferenceImportEntry[],
    expected: WorkspaceRequest,
    section: ItemSection,
  ) => ReferenceBatchResult
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

function getPersistenceError(error: unknown): string {
  return error instanceof Error ? error.message : 'Не удалось сохранить данные CraftCalc'
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
        setPlannerQuantity: (itemId, quantity) => {
          const workspace = get()
          if (!workspace.items[itemId] || !isPlannerQuantity(quantity)) return
          const targets = workspace.planner?.targets ?? []
          const current = targets.find((target) => target.itemId === itemId)
          if (current?.quantity === quantity) return
          set({
            planner: {
              targets: current
                ? targets.map((target) =>
                    target.itemId === itemId ? { itemId, quantity } : target,
                  )
                : [...targets, { itemId, quantity }],
            },
          })
        },
        removePlannerTarget: (itemId) => {
          const targets = get().planner?.targets
          if (!targets?.some((target) => target.itemId === itemId)) return
          set({
            planner: { targets: targets.filter((target) => target.itemId !== itemId) },
          })
        },
        clearPlanner: () => {
          if (get().planner?.targets.length) set({ planner: { targets: [] } })
        },
        moveRootItem: (section, itemId, targetId, position) => {
          const workspace = get()
          const order = selectItemsBySection(
            workspace.items,
            section,
            getState().itemLanguage,
            workspace.rootItemOrder?.[section],
          ).map((item) => item.id)
          if (itemId === targetId || !order.includes(itemId) || !order.includes(targetId))
            return
          const nextOrder = order.filter((id) => id !== itemId)
          nextOrder.splice(
            nextOrder.indexOf(targetId) + (position === 'after' ? 1 : 0),
            0,
            itemId,
          )
          if (nextOrder.every((id, index) => id === order[index])) return
          set({ rootItemOrder: { ...workspace.rootItemOrder, [section]: nextOrder } })
        },
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

            return {
              items,
              ...(state.planner
                ? {
                    planner: {
                      targets: state.planner.targets.filter(
                        (target) => target.itemId !== itemId,
                      ),
                    },
                  }
                : {}),
            }
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
            const targetSource =
              'source' in target.input ? target.input.source : targetItem.source
            if (
              targetSource !== undefined &&
              (targetSource.wowheadItemId !== data.product.wowheadItemId ||
                (targetSource.wowheadVersion !== undefined &&
                  targetSource.wowheadVersion !==
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
          const importedProduct: Item = {
            ...mergeImportedItem(currentProduct, data.product, productItemId, [
              'crafts',
              ...(data.productSection ? [data.productSection] : []),
            ]),
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

            nextItems[reagentItemId] = mergeImportedItem(
              reagent,
              importedReagent,
              reagentItemId,
              ['reagents'],
            )

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

        addReferenceItem: (data, expected, section = 'reagents') => {
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
          const item = mergeImportedItem(current, data, itemId, [section])
          set({ items: { ...items, [itemId]: item } })
          return { success: true, itemId, created: current === undefined }
        },

        importReferenceBatch: (entries, expected, section) => {
          if (!requestIsCurrent(expected))
            return {
              success: false,
              error: 'Версия игры изменилась. Повторите добавление',
            }
          const result = prepareReferenceBatch(
            get().items,
            entries,
            section,
            getState().activeVersion,
          )
          if (!result.success) return result
          set({ items: result.items })
          const persistenceError = usePersistenceStatusStore.getState().hydrationError
          if (persistenceError !== null)
            return { success: false, error: persistenceError }
          return {
            success: true,
            created: result.created,
            reused: result.reused,
            recipes: result.recipes,
          }
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
