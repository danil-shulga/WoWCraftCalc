import { getItemSearchNames, normalizeItemName } from './item-names'
import type { Item, ItemCatalog, ItemId } from './item.types'
import type { RecipeImportItem } from './recipe-import.types'

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

export function getImportAmbiguityError(
  items: ItemCatalog,
  importedItem: RecipeImportItem,
): string | null {
  return findImportedItemCandidates(items, importedItem).length > 1
    ? `Неоднозначное сопоставление «${importedItem.name}»: несколько предметов в каталоге. Уточните названия или источники перед импортом.`
    : null
}
