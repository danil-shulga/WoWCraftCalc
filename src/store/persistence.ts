import { z } from 'zod'
import { DEFAULT_TSM_SETTINGS } from '../domain/tsm'
import { createJSONStorage } from 'zustand/middleware'

import { persistedCraftDataSchema } from '../domain/item.schema'
import { GAME_VERSIONS, GAME_VERSION_REGISTRY } from '../domain/game-version'
import { getCatalogValidationError } from '../domain/recipe-validation'
import type { PersistedCraftData } from '../domain/item.types'
import { notifyLocalStorageChanged } from './local-storage-events'

export const STORAGE_KEY = 'craft-calc-versioned-data'
export const STORAGE_VERSION = 1
export const EXPORT_FORMAT = 'craftcalc-versioned-backup'
export const EXPORT_VERSION = 1

export function createEmptyCraftData(): PersistedCraftData {
  return {
    tbcPricing: { ...DEFAULT_TSM_SETTINGS },
    activeVersion: 'forever',
    workspaces: {
      forever: { items: {}, ownedProfessions: [] },
      tbc: { items: {}, ownedProfessions: [] },
      classic: { items: {}, ownedProfessions: [] },
    },
    currencyDisplay: 'icons',
    itemLanguage: 'ru',
  }
}

const exportSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.literal(EXPORT_VERSION),
  exportedAt: z.string(),
  data: persistedCraftDataSchema,
})

const persistedStorageSchema = z.object({
  state: z.unknown().refine((state) => state !== undefined),
  version: z.number().int().nonnegative().optional(),
})

type NormalizedCraftData = z.output<typeof persistedCraftDataSchema>

export function createCraftStorage(
  onWriteError: (error: unknown) => void = () => {
    /* Optional storage status callback. */
  },
  onWriteSuccess: () => void = () => {
    /* Optional storage status callback. */
  },
) {
  let writesBlocked = false
  // Resolve localStorage on access so an unavailable browser storage is a load error.
  const storage = createJSONStorage<PersistedCraftData>(
    () => ({
      getItem: (name) => {
        if (localStorage.getItem('craft-calc-data') !== null) {
          localStorage.removeItem('craft-calc-data')
          notifyLocalStorageChanged()
        }
        return localStorage.getItem(name)
      },
      setItem: (name, value) => {
        localStorage.setItem(name, value)
        notifyLocalStorageChanged()
      },
      removeItem: (name) => {
        localStorage.removeItem(name)
        notifyLocalStorageChanged()
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
        try {
          const result = storage.setItem(...args)
          onWriteSuccess()
          return result
        } catch (error) {
          onWriteError(error)
        }
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
      apply: (data: NormalizedCraftData) => void,
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

function assertCatalogIsValid(data: NormalizedCraftData): NormalizedCraftData {
  for (const version of GAME_VERSIONS) {
    const workspace = data.workspaces[version]
    const definition = GAME_VERSION_REGISTRY[version]
    const targetIds = new Set<string>()
    for (const target of workspace.planner?.targets ?? []) {
      if (targetIds.has(target.itemId) || !workspace.items[target.itemId])
        throw new Error(`${definition.name}: повторяющаяся или отсутствующая цель плана`)
      targetIds.add(target.itemId)
    }
    const validationError = getCatalogValidationError(workspace.items, data.itemLanguage)
    if (validationError !== null)
      throw new Error(`${definition.name}: ${validationError}`)
    if (
      workspace.ownedProfessions.some(
        (profession) => !definition.professions.includes(profession),
      )
    )
      throw new Error(`${definition.name}: недоступная профессия`)
    for (const item of Object.values(workspace.items)) {
      if (
        item.source?.wowheadVersion !== undefined &&
        item.source.wowheadVersion !== definition.wowheadVersion
      )
        throw new Error(
          `${definition.name}: источник предмета относится к другой версии игры`,
        )
      if (
        item.recipe?.profession &&
        !definition.professions.includes(item.recipe.profession)
      )
        throw new Error(`${definition.name}: профессия рецепта недоступна`)
    }
  }
  return data
}

export function parseCurrentPersistedData(state: unknown): NormalizedCraftData {
  const parsed = persistedCraftDataSchema.safeParse(state)

  if (!parsed.success) {
    throw new Error('Сохранённые данные не соответствуют текущему формату CraftCalc')
  }

  return assertCatalogIsValid(parsed.data)
}

export function createExportJson(data: PersistedCraftData): string {
  return JSON.stringify(
    {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      data: parseCurrentPersistedData(data),
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
      error:
        'Неподдерживаемый или повреждённый формат. Нужна полная резервная копия CraftCalc для трёх версий игры; старые копии не поддерживаются',
    }
  }

  try {
    return { success: true, data: assertCatalogIsValid(parsed.data.data) }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Некорректная резервная копия',
    }
  }
}
