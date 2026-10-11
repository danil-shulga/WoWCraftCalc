import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { z } from 'zod'

import { getRecipeValidationError } from '../domain/recipe-validation'
import type {
  AcquisitionMethod,
  Item,
  ItemCatalog,
  ItemId,
  ItemPriceField,
  PersistedCraftData,
  Recipe,
} from '../domain/item.types'
import { PROFESSION_IDS, type Profession } from '../domain/professions'
import type { CurrencyDisplayMode } from '../domain/user-settings'
import {
  createCraftStorage,
  migratePersistedData,
  parseCurrentPersistedData,
} from './persistence'

export type ItemInput = Omit<Item, 'id' | 'recipe'>

export interface RecipeImportItem {
  wowheadItemId: number
  name: string
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
const storageVersion = 4

function getPersistenceError(error: unknown): string {
  return error instanceof Error ? error.message : 'Не удалось сохранить данные CraftCalc'
}

function normalizeItemName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU')
}

export function findImportedItem(
  items: ItemCatalog,
  importedItem: RecipeImportItem,
  excludedIds: ReadonlySet<ItemId> = new Set(),
): Item | undefined {
  const sourceMatch = Object.values(items).find(
    (item) =>
      !excludedIds.has(item.id) &&
      item.source?.wowheadItemId === importedItem.wowheadItemId,
  )

  if (sourceMatch !== undefined) {
    return sourceMatch
  }

  const normalizedName = normalizeItemName(importedItem.name)
  const nameMatches = Object.values(items).filter(
    (item) =>
      !excludedIds.has(item.id) && normalizeItemName(item.name) === normalizedName,
  )

  return nameMatches.length === 1 ? nameMatches[0] : undefined
}

export const useCraftStore = create<CraftStore>()(
  persist<CraftStore, [], [], PersistedCraftData>(
    (set, get) => ({
      items: {},
      ownedProfessions: [],
      currencyDisplay: 'icons',

      createItem: (input) => {
        const itemId = crypto.randomUUID()
        const item = {
          ...input,
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
          iconUrl:
            data.product.iconUrl.length > 0
              ? data.product.iconUrl
              : (currentProduct?.iconUrl ?? ''),
          source: { wowheadItemId: data.product.wowheadItemId },
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
            iconUrl:
              importedReagent.iconUrl.length > 0
                ? importedReagent.iconUrl
                : (reagent?.iconUrl ?? ''),
            source: { wowheadItemId: importedReagent.wowheadItemId },
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
    }),
    {
      name: storageKey,
      storage: craftStorage,
      version: storageVersion,
      partialize: (state) => ({
        items: state.items,
        ownedProfessions: state.ownedProfessions,
        currencyDisplay: state.currencyDisplay,
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
