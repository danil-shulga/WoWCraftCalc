import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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
import type { Profession } from '../domain/professions'
import type { CurrencyDisplayMode } from '../domain/user-settings'
import { migratePersistedData, parseCurrentPersistedData } from './persistence'

export type ItemInput = Omit<Item, 'id' | 'recipe'>

interface CraftStore {
  items: ItemCatalog
  ownedProfessions: Profession[]
  currencyDisplay: CurrencyDisplayMode
  createItem: (input: ItemInput) => ItemId
  updateItem: (itemId: ItemId, input: ItemInput) => void
  setItemPrice: (itemId: ItemId, field: ItemPriceField, value: number | null) => void
  removeItem: (itemId: ItemId) => void
  setRecipe: (itemId: ItemId, recipe: Recipe | null) => string | null
  setAcquisition: (
    ownerItemId: ItemId,
    reagentItemId: ItemId,
    acquisition: AcquisitionMethod,
  ) => void
  replaceData: (data: PersistedCraftData) => void
  setProfessionOwned: (profession: Profession, owned: boolean) => void
  setCurrencyDisplay: (mode: CurrencyDisplayMode) => void
}

interface PersistenceStatusStore {
  hydrationError: string | null
  setHydrationError: (error: string | null) => void
}

export const usePersistenceStatusStore = create<PersistenceStatusStore>((set) => ({
  hydrationError: null,
  setHydrationError: (hydrationError) => {
    set({ hydrationError })
  },
}))

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

      replaceData: (data) => {
        set(data)
      },

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
      name: 'craft-calc-data',
      version: 4,
      partialize: (state) => ({
        items: state.items,
        ownedProfessions: state.ownedProfessions,
        currencyDisplay: state.currencyDisplay,
      }),
      migrate: migratePersistedData,
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...parseCurrentPersistedData(persistedState),
      }),
      onRehydrateStorage: () => (_state, error) => {
        usePersistenceStatusStore
          .getState()
          .setHydrationError(
            error instanceof Error
              ? error.message
              : error === undefined
                ? null
                : 'Не удалось загрузить сохранённые данные CraftCalc',
          )
      },
    },
  ),
)
