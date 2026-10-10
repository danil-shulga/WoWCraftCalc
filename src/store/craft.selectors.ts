import type { Item, ItemCatalog, ItemId, ItemSection } from '../domain/item.types'

function sortByName(items: Item[]): Item[] {
  return [...items].sort((left, right) => left.name.localeCompare(right.name, 'ru'))
}

export function selectItemsBySection(catalog: ItemCatalog, section: ItemSection): Item[] {
  return sortByName(
    Object.values(catalog).filter((item) => item.sections.includes(section)),
  )
}

export function selectAvailableReagents(
  catalog: ItemCatalog,
  ownerItemId: ItemId,
  selectedIds: ReadonlySet<ItemId>,
): Item[] {
  return sortByName(
    Object.values(catalog).filter(
      (item) => item.id !== ownerItemId && !selectedIds.has(item.id),
    ),
  )
}
