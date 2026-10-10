import { z } from 'zod'

import { itemSchema } from '../domain/item.schema'
import { getRecipeValidationError } from '../domain/recipe-validation'
import type { ItemCatalog } from '../domain/item.types'

const exportSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  items: z.record(z.string(), itemSchema),
})

export type ImportResult =
  { success: true; items: ItemCatalog } | { success: false; error: string }

export function createExportJson(items: ItemCatalog): string {
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      items,
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

  for (const [catalogId, item] of Object.entries(parsed.data.items)) {
    if (catalogId !== item.id) {
      return {
        success: false,
        error: `Идентификатор предмета «${item.name}» повреждён`,
      }
    }

    const validationError = getRecipeValidationError(
      parsed.data.items,
      item.id,
      item.recipe?.reagents ?? [],
    )

    if (validationError !== null) {
      return {
        success: false,
        error: `Ошибка в рецепте «${item.name}»: ${validationError}`,
      }
    }
  }

  return { success: true, items: parsed.data.items }
}
