import { z } from 'zod'
import { createJSONStorage } from 'zustand/middleware'

import {
  itemSchema,
  persistedCraftDataSchema,
  recipeLineSchema,
  recipeSchema,
} from '../domain/item.schema'
import { getCatalogValidationError } from '../domain/recipe-validation'
import type { ItemCatalog, PersistedCraftData } from '../domain/item.types'

const legacyRecipeSchema = recipeSchema.extend({
  reagents: z.array(recipeLineSchema),
})

const legacyItemSchema = itemSchema.extend({
  recipe: legacyRecipeSchema.nullable(),
})

const legacyItemsSchema = z.record(z.string(), legacyItemSchema)

const exportSchema = z.discriminatedUnion('version', [
  z.object({
    version: z.literal(1),
    exportedAt: z.string(),
    items: legacyItemsSchema,
  }),
  z.object({
    version: z.literal(2),
    exportedAt: z.string(),
    items: legacyItemsSchema,
  }),
  z.object({
    version: z.literal(3),
    exportedAt: z.string(),
    data: persistedCraftDataSchema,
  }),
])

const legacyPersistedCraftDataSchema = z.object({
  items: legacyItemsSchema,
  ownedProfessions: persistedCraftDataSchema.shape.ownedProfessions,
  currencyDisplay: persistedCraftDataSchema.shape.currencyDisplay,
})

const persistedStorageSchema = z.object({
  state: z.unknown().refine((state) => state !== undefined),
  version: z.number().int().nonnegative().optional(),
})

export function createCraftStorage() {
  let writesBlocked = false
  // Resolve localStorage on access so an unavailable browser storage is a load error.
  const storage = createJSONStorage<PersistedCraftData>(
    () => ({
      getItem: (name) => localStorage.getItem(name),
      setItem: (name, value) => {
        localStorage.setItem(name, value)
      },
      removeItem: (name) => {
        localStorage.removeItem(name)
      },
    }),
    {
      reviver: (key, value: unknown) => {
        if (key !== '') {
          return value
        }

        // JSON null is an existing record, unlike a missing localStorage key.
        const parsed = persistedStorageSchema.safeParse(value)

        if (!parsed.success) {
          throw new Error(
            'Сохранённые данные не соответствуют формату хранилища CraftCalc',
          )
        }

        return parsed.data
      },
    },
  )

  if (storage === undefined) {
    throw new Error('Хранилище CraftCalc недоступно')
  }

  return {
    getItem: storage.getItem,
    setItem: (...args: Parameters<typeof storage.setItem>) => {
      if (!writesBlocked) {
        return storage.setItem(...args)
      }
    },
    removeItem: (name: string) => {
      if (!writesBlocked) {
        return storage.removeItem(name)
      }
    },
    blockWrites: () => {
      writesBlocked = true
    },
    replaceData: (
      name: string,
      data: PersistedCraftData,
      version: number,
      apply: (data: PersistedCraftData) => void,
    ) => {
      const parsed = parseCurrentPersistedData(data)
      // Persist first: a failed write must keep both the original record and catalog.
      storage.setItem(name, { state: parsed, version })
      writesBlocked = true
      try {
        apply(parsed)
      } finally {
        writesBlocked = false
      }
    },
  }
}

export type ImportResult =
  { success: true; data: PersistedCraftData } | { success: false; error: string }

function normalizeLegacyItems(
  items: ItemCatalog,
  resetAcquisition: boolean,
): ItemCatalog {
  return Object.fromEntries(
    Object.entries(items).map(([itemId, item]) => {
      if (item.recipe === null || item.recipe.reagents.length === 0) {
        return [itemId, { ...item, recipe: null }]
      }

      if (!resetAcquisition) {
        return [itemId, item]
      }

      return [
        itemId,
        {
          ...item,
          recipe: {
            ...item.recipe,
            reagents: item.recipe.reagents.map((line) => ({
              ...line,
              acquisition: 'auto' as const,
            })),
          },
        },
      ]
    }),
  )
}

function assertCatalogIsValid(data: PersistedCraftData): PersistedCraftData {
  const validationError = getCatalogValidationError(data.items)

  if (validationError !== null) {
    throw new Error(validationError)
  }

  return data
}

export function parseCurrentPersistedData(state: unknown): PersistedCraftData {
  const parsed = persistedCraftDataSchema.safeParse(state)

  if (!parsed.success) {
    throw new Error('Сохранённые данные не соответствуют текущему формату CraftCalc')
  }

  return assertCatalogIsValid(parsed.data)
}

export function migratePersistedData(
  state: unknown,
  version: number,
): PersistedCraftData {
  if (version >= 4) {
    return parseCurrentPersistedData(state)
  }

  const parsed = legacyPersistedCraftDataSchema.safeParse(state)

  if (!parsed.success) {
    throw new Error('Не удалось преобразовать сохранённые данные CraftCalc')
  }

  return assertCatalogIsValid({
    ...parsed.data,
    items: normalizeLegacyItems(parsed.data.items, version < 2),
  })
}

export function createExportJson(data: PersistedCraftData): string {
  return JSON.stringify(
    {
      version: 3,
      exportedAt: new Date().toISOString(),
      data,
    },
    null,
    2,
  )
}

export function parseImportedData(rawJson: string): ImportResult {
  let parsedJson: unknown

  try {
    parsedJson = JSON.parse(rawJson) as unknown
  } catch {
    return { success: false, error: 'Файл не является корректным JSON' }
  }

  const parsed = exportSchema.safeParse(parsedJson)

  if (!parsed.success) {
    return {
      success: false,
      error: 'Структура файла не соответствует формату CraftCalc',
    }
  }

  const data =
    parsed.data.version === 3
      ? parsed.data.data
      : {
          items: normalizeLegacyItems(parsed.data.items, parsed.data.version === 1),
          ownedProfessions: [],
          currencyDisplay: 'icons' as const,
        }
  const validationError = getCatalogValidationError(data.items)

  if (validationError !== null) {
    return { success: false, error: validationError }
  }

  return { success: true, data }
}
