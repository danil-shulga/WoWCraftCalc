import { getItemName, getItemSearchNames, normalizeItemName } from './item-names'
import type { ItemSection } from './item.types'
import type { Profession } from './professions'
import type {
  ReferenceDatabase,
  ReferenceItem,
  ReferenceRecipe,
} from './reference-database.types'
import type { ItemLanguage } from './user-settings'

export function referenceItemName(item: ReferenceItem, language: ItemLanguage = 'ru') {
  return getItemName({ name: String(item.itemId), names: item.names }, language)
}

export interface ReferenceDatabaseIndex {
  database: ReferenceDatabase
  searchNames: Map<number, string[]>
  recipesByProduct: Map<number, ReferenceRecipe[]>
  productsByProfession: Map<Profession, Set<number>>
  reagentsByProfession: Map<Profession, Set<number>>
  reagentIds: Set<number>
}

export function buildReferenceDatabaseIndex(
  database: ReferenceDatabase,
): ReferenceDatabaseIndex {
  const index: ReferenceDatabaseIndex = {
    database,
    searchNames: new Map(),
    recipesByProduct: new Map(),
    productsByProfession: new Map(),
    reagentsByProfession: new Map(),
    reagentIds: new Set(),
  }
  for (const item of Object.values(database.items)) {
    index.searchNames.set(
      item.itemId,
      getItemSearchNames({ name: referenceItemName(item), names: item.names }).map(
        normalizeItemName,
      ),
    )
  }
  for (const recipe of Object.values(database.recipes)) {
    const recipes = index.recipesByProduct.get(recipe.productItemId) ?? []
    recipes.push(recipe)
    index.recipesByProduct.set(recipe.productItemId, recipes)
    const products =
      index.productsByProfession.get(recipe.profession) ?? new Set<number>()
    products.add(recipe.productItemId)
    index.productsByProfession.set(recipe.profession, products)
    const reagents =
      index.reagentsByProfession.get(recipe.profession) ?? new Set<number>()
    for (const reagent of recipe.reagents) {
      index.reagentIds.add(reagent.itemId)
      reagents.add(reagent.itemId)
    }
    index.reagentsByProfession.set(recipe.profession, reagents)
  }
  for (const source of database.reagentSources ?? []) {
    for (const reagent of source.reagents) index.reagentIds.add(reagent.itemId)
    if (source.profession) {
      const reagents =
        index.reagentsByProfession.get(source.profession) ?? new Set<number>()
      for (const reagent of source.reagents) reagents.add(reagent.itemId)
      index.reagentsByProfession.set(source.profession, reagents)
    }
  }
  // A conversion ingredient belongs to every profession consuming its product.
  // Iterate to support chains independently of source spell order.
  let changed = true
  while (changed) {
    changed = false
    for (const source of database.reagentSources ?? []) {
      if (source.kind !== 'item-conversion' || source.productItemId === null) continue
      for (const reagents of index.reagentsByProfession.values()) {
        if (!reagents.has(source.productItemId)) continue
        for (const reagent of source.reagents) {
          if (!reagents.has(reagent.itemId)) {
            reagents.add(reagent.itemId)
            changed = true
          }
        }
      }
    }
  }
  return index
}

export function searchReferenceItems(
  index: ReferenceDatabaseIndex,
  section: ItemSection,
  query: string,
  profession: Profession | null = null,
  language: ItemLanguage = 'ru',
): ReferenceItem[] {
  const ids =
    section === 'crafts' ? index.recipesByProduct.keys() : index.reagentIds.values()
  const professionIds =
    profession === null
      ? null
      : (section === 'crafts'
          ? index.productsByProfession
          : index.reagentsByProfession
        ).get(profession)
  const normalized = normalizeItemName(query)
  const items: ReferenceItem[] = []
  for (const id of ids) {
    const item = index.database.items[String(id)]
    if (
      item &&
      (profession === null || professionIds?.has(id)) &&
      index.searchNames.get(id)?.some((name) => name.includes(normalized))
    )
      items.push(item)
  }
  return items.sort((a, b) =>
    referenceItemName(a, language).localeCompare(
      referenceItemName(b, language),
      language,
    ),
  )
}
