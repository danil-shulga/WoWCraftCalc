import { z } from 'zod'
import { GAME_VERSION_REGISTRY, type GameVersion } from '../domain/game-version'
import {
  findImportedItem,
  getImportAmbiguityError,
} from '../domain/imported-item-matching'
import { itemNamesSchema, itemSchema } from '../domain/item.schema'
import type { Item, ItemCatalog, ItemId, ItemSection } from '../domain/item.types'
import { PROFESSION_IDS } from '../domain/professions'
import type {
  RecipeImportItem,
  ReferenceImportEntry,
} from '../domain/recipe-import.types'
import { getRecipeValidationError } from '../domain/recipe-validation'
import { WOWHEAD_VERSIONS } from '../domain/user-settings'

export const recipeImportItemSchema = z.object({
  wowheadItemId: z.number().int().positive(),
  name: z.string().trim().min(1),
  names: itemNamesSchema.optional(),
  wowheadVersion: z.enum(WOWHEAD_VERSIONS).optional(),
  iconUrl: z.union([z.literal(''), z.url()]),
  requiredLevel: itemSchema.shape.requiredLevel,
  qualityId: itemSchema.shape.qualityId,
  itemLevel: itemSchema.shape.itemLevel,
  classId: itemSchema.shape.classId,
  subclassId: itemSchema.shape.subclassId,
  inventoryType: itemSchema.shape.inventoryType,
  defaultPurchasePriceCopper: z.number().int().nonnegative().nullable().optional(),
  defaultSalePriceCopper: z.number().int().nonnegative().nullable().optional(),
})

export const recipeImportSchema = z.object({
  product: recipeImportItemSchema,
  reagents: z
    .array(recipeImportItemSchema.extend({ quantity: z.number().int().positive() }))
    .min(1),
  outputQuantity: z.number().int().positive(),
  profession: z.enum(PROFESSION_IDS).nullable(),
  productSection: z.enum(['crafts', 'reagents', 'disenchanting']).optional(),
})

export function mergeImportedItem(
  current: Item | undefined,
  data: RecipeImportItem,
  itemId: ItemId,
  sections: readonly ItemSection[],
): Item {
  return {
    ...current,
    id: itemId,
    name: data.name,
    names: {
      ru: data.names?.ru ?? current?.names?.ru ?? null,
      en: data.names?.en ?? current?.names?.en ?? null,
    },
    iconUrl: data.iconUrl.length > 0 ? data.iconUrl : (current?.iconUrl ?? ''),
    requiredLevel: data.requiredLevel ?? current?.requiredLevel ?? null,
    qualityId: data.qualityId ?? current?.qualityId ?? null,
    itemLevel: data.itemLevel ?? current?.itemLevel ?? null,
    classId: data.classId ?? current?.classId ?? null,
    subclassId: data.subclassId ?? current?.subclassId ?? null,
    inventoryType: data.inventoryType ?? current?.inventoryType ?? null,
    source: {
      wowheadItemId: data.wowheadItemId,
      ...(data.wowheadVersion === undefined
        ? {}
        : { wowheadVersion: data.wowheadVersion }),
    },
    sections: [...new Set([...(current?.sections ?? []), ...sections])],
    purchasePriceCopper: current
      ? current.purchasePriceCopper
      : (data.defaultPurchasePriceCopper ?? null),
    salePriceCopper: current
      ? current.salePriceCopper
      : (data.defaultSalePriceCopper ?? null),
    recipe: current?.recipe ?? null,
  }
}

export type ReferenceBatchResult =
  | { success: true; created: number; reused: number; recipes: number }
  | { success: false; error: string; sourceItemId?: number }

type PreparedBatch =
  | {
      success: true
      items: ItemCatalog
      created: number
      reused: number
      recipes: number
    }
  | Extract<ReferenceBatchResult, { success: false }>

export function prepareReferenceBatch(
  currentItems: ItemCatalog,
  entries: readonly ReferenceImportEntry[],
  section: ItemSection,
  version: GameVersion,
): PreparedBatch {
  if (!entries.length) return { success: false, error: 'Выберите хотя бы один предмет' }
  if (!['crafts', 'reagents', 'disenchanting'].includes(section))
    return { success: false, error: 'Неизвестный раздел каталога' }
  const definition = GAME_VERSION_REGISTRY[version]
  const selected = new Set<number>()
  const importedItems = new Map<
    number,
    { data: RecipeImportItem; sections: Set<ItemSection> }
  >()
  const initialMatches = new Map<ItemId, number>()
  const addItem = (data: RecipeImportItem, sections: ItemSection[]) => {
    const previous = importedItems.get(data.wowheadItemId)
    importedItems.set(data.wowheadItemId, {
      data,
      sections: new Set([...(previous?.sections ?? []), ...sections]),
    })
  }
  const parsedEntries: ReferenceImportEntry[] = []
  for (const entry of entries) {
    const product = entry.kind === 'recipe' ? entry.data.product : entry.item
    const fail = (error: string) => ({
      success: false as const,
      error,
      sourceItemId: product.wowheadItemId,
    })
    const parsed =
      entry.kind === 'recipe'
        ? recipeImportSchema.safeParse(entry.data)
        : recipeImportItemSchema.safeParse(entry.item)
    if (!parsed.success)
      return fail('Некорректные данные: проверьте состав, выход и описание предмета')
    if (selected.has(product.wowheadItemId)) return fail('Предмет выбран несколько раз')
    selected.add(product.wowheadItemId)
    if (entry.kind === 'item' && section === 'crafts')
      return fail('Для крафта выберите рецепт')
    const items = entry.kind === 'recipe' ? [product, ...entry.data.reagents] : [product]
    if (
      items.some(
        (item) =>
          item.wowheadVersion !== undefined &&
          item.wowheadVersion !== definition.wowheadVersion,
      )
    )
      return fail('Версия источника не совпадает с текущей версией игры')
    for (const item of items) {
      const ambiguity = getImportAmbiguityError(currentItems, item)
      if (ambiguity !== null) return fail(ambiguity)
      const match = findImportedItem(currentItems, item)
      if (match) {
        const sourceId = initialMatches.get(match.id)
        if (sourceId !== undefined && sourceId !== item.wowheadItemId)
          return fail('Разные предметы базы сопоставлены с одним предметом каталога')
        initialMatches.set(match.id, item.wowheadItemId)
      }
    }
    if (entry.kind === 'recipe') {
      const recipe = recipeImportSchema.parse(entry.data)
      if (recipe.profession && !definition.professions.includes(recipe.profession))
        return fail('Профессия недоступна в этой версии игры')
      const ids = new Set<number>()
      for (const reagent of recipe.reagents) {
        if (
          reagent.wowheadItemId === product.wowheadItemId ||
          ids.has(reagent.wowheadItemId)
        )
          return fail(
            'Рецепт содержит повтор реагента или ссылку на собственный результат',
          )
        ids.add(reagent.wowheadItemId)
        addItem(reagent, ['reagents'])
      }
      parsedEntries.push({ kind: 'recipe', data: recipe })
    } else {
      parsedEntries.push({ kind: 'item', item: recipeImportItemSchema.parse(entry.item) })
    }
  }
  // All nodes are resolved before recipes: a selected product may also be a reagent.
  for (const entry of parsedEntries) {
    if (entry.kind === 'recipe') addItem(entry.data.product, ['crafts', section])
    else addItem(entry.item, [section])
  }
  const nextItems = { ...currentItems }
  const catalogIds = new Map<number, ItemId>()
  let created = 0
  for (const [sourceId, imported] of [...importedItems].sort(([a], [b]) => a - b)) {
    const ambiguity = getImportAmbiguityError(nextItems, imported.data)
    if (ambiguity !== null)
      return { success: false, error: ambiguity, sourceItemId: sourceId }
    const current = findImportedItem(nextItems, imported.data)
    const id = current?.id ?? crypto.randomUUID()
    if (!current) created++
    nextItems[id] = mergeImportedItem(current, imported.data, id, [...imported.sections])
    catalogIds.set(sourceId, id)
  }
  let recipes = 0
  for (const entry of parsedEntries) {
    if (entry.kind !== 'recipe') continue
    const data = entry.data
    const id = catalogIds.get(data.product.wowheadItemId)
    const product = id === undefined ? undefined : nextItems[id]
    if (!product) throw new Error('Результат отсутствует в подготовленном каталоге')
    nextItems[product.id] = {
      ...product,
      recipe: {
        outputQuantity: data.outputQuantity,
        profession: data.profession,
        reagents: data.reagents.map((line) => {
          const itemId = catalogIds.get(line.wowheadItemId)
          if (itemId === undefined)
            throw new Error('Реагент отсутствует в подготовленном каталоге')
          return {
            itemId,
            quantity: line.quantity,
            acquisition:
              currentItems[product.id]?.recipe?.reagents.find(
                (previous) => previous.itemId === itemId,
              )?.acquisition ?? 'auto',
          }
        }),
      },
    }
    recipes++
  }
  // Validate the final graph; intermediate replacements may temporarily form a cycle.
  for (const entry of parsedEntries) {
    const sourceId =
      entry.kind === 'recipe'
        ? entry.data.product.wowheadItemId
        : entry.item.wowheadItemId
    const id = catalogIds.get(sourceId)
    const item = id === undefined ? undefined : nextItems[id]
    if (item?.recipe) {
      const error = getRecipeValidationError(nextItems, item.id, item.recipe.reagents)
      if (error !== null) return { success: false, error, sourceItemId: sourceId }
    }
  }
  return {
    success: true,
    items: nextItems,
    created,
    reused: importedItems.size - created,
    recipes,
  }
}
