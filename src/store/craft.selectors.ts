import type { Item, ItemCatalog, ItemId, ItemSection } from '../domain/item.types'
import { getItemName } from '../domain/item-names'
import type { ItemLanguage } from '../domain/user-settings'

function sortByName(items: Item[], language: ItemLanguage): Item[] {
  return [...items].sort((left, right) =>
    getItemName(left, language).localeCompare(getItemName(right, language), language),
  )
}

export function selectItemsBySection(
  catalog: ItemCatalog,
  section: ItemSection,
  language: ItemLanguage = 'ru',
): Item[] {
  return sortByName(
    Object.values(catalog).filter((item) => item.sections.includes(section)),
    language,
  )
}

export function selectAvailableReagents(
  catalog: ItemCatalog,
  ownerItemId: ItemId,
  selectedIds: ReadonlySet<ItemId>,
  language: ItemLanguage = 'ru',
): Item[] {
  return sortByName(
    Object.values(catalog).filter(
      (item) => item.id !== ownerItemId && !selectedIds.has(item.id),
    ),
    language,
  )
}
