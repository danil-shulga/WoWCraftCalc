import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { z } from 'zod'

import { getItemSearchNames, normalizeItemName } from '../domain/item-names'
import { itemNamesSchema } from '../domain/item.schema'

import { getRecipeValidationError } from '../domain/recipe-validation'
import type {
  AcquisitionMethod,
  Item,
  ItemCatalog,
  ItemId,
  ItemNames,
  ItemNamesUpdate,
  ItemPriceField,
  PersistedCraftData,
  Recipe,
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
  migratePersistedData,
  parseCurrentPersistedData,
} from './persistence'

export type ItemInput = Omit<Item, 'id' | 'recipe'>

export interface RecipeImportItem {
  wowheadItemId: number
  name: string
  names?: ItemNames | undefined
  wowheadVersion?: WowheadVersion | undefined
  iconUrl: string
}

export interface RecipeImportData {
  product: RecipeImportItem
  reagents: (RecipeImportItem & { quantity: number })[]
  outputQuantity: number
  profession: Profession | null
}

const recipeImportItemSchema = z.object({
  wowheadItemId: z.number().int().positive(),
  name: z.string().trim().min(1),
  names: itemNamesSchema.optional(),
  wowheadVersion: z.enum(WOWHEAD_VERSIONS).optional(),
  iconUrl: z.union([z.literal(''), z.url()]),
})

const recipeImportSchema = z.object({
  product: recipeImportItemSchema,
  reagents: z
    .array(recipeImportItemSchema.extend({ quantity: z.number().int().positive() }))
    .min(1),
  outputQuantity: z.number().int().positive(),
  profession: z.enum(PROFESSION_IDS).nullable(),
})

export type RecipeImportResult =
  | {
      success: true
      productItemId: ItemId
      productCreated: boolean
      reagentsCreated: number
    }
  | { success: false; error: string }

interface CraftStore {
  items: ItemCatalog
  ownedProfessions: Profession[]
  currencyDisplay: CurrencyDisplayMode
  itemLanguage: ItemLanguage
  createItem: (input: ItemInput) => ItemId
  updateItem: (itemId: ItemId, input: ItemInput) => void
  setItemPrice: (itemId: ItemId, field: ItemPriceField, value: number | null) => void
  setItemPrices: (
    field: ItemPriceField,
    prices: Readonly<Record<ItemId, number | null>>,
  ) => void
  removeItem: (itemId: ItemId) => void
  setRecipe: (itemId: ItemId, recipe: Recipe | null) => string | null
  setAcquisition: (
    ownerItemId: ItemId,
    reagentItemId: ItemId,
    acquisition: AcquisitionMethod,
  ) => void
  importRecipe: (data: RecipeImportData) => RecipeImportResult
  replaceData: (data: PersistedCraftData) => string | null
  resetData: () => string | null
  setProfessionOwned: (profession: Profession, owned: boolean) => void
  setCurrencyDisplay: (mode: CurrencyDisplayMode) => void
  setItemLanguage: (language: ItemLanguage) => void
  fillItemNames: (updates: readonly ItemNamesUpdate[]) => string | null
}

interface PersistenceStatusStore {
  hydrationError: string | null
  recoveryRequired: boolean
  setHydrationError: (error: string | null) => void
}

export const usePersistenceStatusStore = create<PersistenceStatusStore>((set) => ({
  hydrationError: null,
  recoveryRequired: false,
  setHydrationError: (hydrationError) => {
    set({ hydrationError, recoveryRequired: hydrationError !== null })
  },
}))

const craftStorage = createCraftStorage()
const storageKey = 'craft-calc-data'
const storageVersion = 5

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

export function findImportedItem(
  items: ItemCatalog,
  importedItem: RecipeImportItem,
  excludedIds: ReadonlySet<ItemId> = new Set(),
): Item | undefined {
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
    return sourceMatches.length === 1 ? sourceMatches[0] : undefined
  }

  const importedNames = new Set(getItemSearchNames(importedItem).map(normalizeItemName))
  const nameMatches = candidates.filter(
    (item) =>
      compatibleSource(item) &&
      (item.source === undefined ||
        item.source.wowheadItemId === importedItem.wowheadItemId) &&
      getItemSearchNames(item).some((name) => importedNames.has(normalizeItemName(name))),
  )

  return nameMatches.length === 1 ? nameMatches[0] : undefined
}

export const useCraftStore = create<CraftStore>()(
  persist<CraftStore, [], [], PersistedCraftData>(
    (set, get) => ({
      items: {},
      ownedProfessions: [],
      currencyDisplay: 'icons',
      itemLanguage: 'ru',

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
          const validationError = getRecipeValidationError(items, itemId, recipe.reagents)

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

      importRecipe: (data) => {
        const parsed = recipeImportSchema.safeParse(data)
        if (!parsed.success) {
          return {
            success: false,
            error: 'Некорректные данные импорта: проверьте состав, выход и профессию',
          }
        }
        data = parsed.data
        const currentItems = get().items
        const currentProduct = findImportedItem(currentItems, data.product)
        const productItemId = currentProduct?.id ?? crypto.randomUUID()
        const productCreated = currentProduct === undefined
        const nextItems: ItemCatalog = { ...currentItems }
        const productSections = currentProduct?.sections ?? []
        const importedProduct: Item = {
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
          sections: [...new Set([...productSections, 'crafts' as const])],
          purchasePriceCopper: currentProduct?.purchasePriceCopper ?? null,
          salePriceCopper: currentProduct?.salePriceCopper ?? null,
          recipe: currentProduct?.recipe ?? null,
        }
        nextItems[productItemId] = importedProduct

        const reagentLines: Recipe['reagents'] = []
        let reagentsCreated = 0

        for (const importedReagent of data.reagents) {
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
            purchasePriceCopper: reagent?.purchasePriceCopper ?? null,
            salePriceCopper: reagent?.salePriceCopper ?? null,
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

      replaceData: (data) => {
        try {
          craftStorage.replaceData(storageKey, data, storageVersion, set)
          usePersistenceStatusStore.getState().setHydrationError(null)
          return null
        } catch (error) {
          return getPersistenceError(error)
        }
      },

      resetData: () =>
        get().replaceData({
          items: {},
          ownedProfessions: [],
          currencyDisplay: 'icons',
          itemLanguage: 'ru',
        }),

      setProfessionOwned: (profession, owned) => {
        set((state) => ({
          ownedProfessions: owned
            ? [...new Set([...state.ownedProfessions, profession])]
            : state.ownedProfessions.filter((current) => current !== profession),
        }))
      },

      setCurrencyDisplay: (currencyDisplay) => {
        set({ currencyDisplay })
      },
      setItemLanguage: (itemLanguage) => {
        set({ itemLanguage })
      },
      fillItemNames: (updates) => {
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
          if (
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
    }),
    {
      name: storageKey,
      storage: craftStorage,
      version: storageVersion,
      partialize: (state) => ({
        items: state.items,
        ownedProfessions: state.ownedProfessions,
        currencyDisplay: state.currencyDisplay,
        itemLanguage: state.itemLanguage,
      }),
      migrate: migratePersistedData,
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
