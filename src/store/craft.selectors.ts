import type { Item, ItemCatalog, ItemId, ItemSection } from '../domain/item.types'
import { getItemName } from '../domain/item-names'
import type { ItemLanguage } from '../domain/user-settings'
import type { PersistedCraftData } from '../domain/item.types'
import type { PlannerTarget } from '../domain/planner.types'

const emptyPlannerTargets: PlannerTarget[] = []

export function selectPlannerTargets(
  state: Pick<PersistedCraftData, 'activeVersion' | 'workspaces'>,
) {
  return selectActiveWorkspace(state).planner?.targets ?? emptyPlannerTargets
}

export function selectActiveWorkspace(
  state: Pick<PersistedCraftData, 'activeVersion' | 'workspaces'>,
) {
  return state.workspaces[state.activeVersion]
}

export function selectActiveItems(
  state: Pick<PersistedCraftData, 'activeVersion' | 'workspaces'>,
) {
  return selectActiveWorkspace(state).items
}

export function selectActiveProfessions(
  state: Pick<PersistedCraftData, 'activeVersion' | 'workspaces'>,
) {
  return selectActiveWorkspace(state).ownedProfessions
}

function sortByName(items: Item[], language: ItemLanguage): Item[] {
  return [...items].sort((left, right) =>
    getItemName(left, language).localeCompare(getItemName(right, language), language),
  )
}

export function selectItemsBySection(
  catalog: ItemCatalog,
  section: ItemSection | 'favorites',
  language: ItemLanguage = 'ru',
  order: readonly ItemId[] = [],
): Item[] {
  const sorted = sortByName(selectSectionItems(catalog, section), language)
  const ranks = new Map(order.map((id, index) => [id, index]))
  return sorted.sort(
    (left, right) =>
      (ranks.get(left.id) ?? order.length) - (ranks.get(right.id) ?? order.length),
  )
}

export function selectSectionItems(
  catalog: ItemCatalog,
  section: ItemSection | 'favorites',
): Item[] {
  return Object.values(catalog).filter((item) =>
    section === 'favorites' ? item.isFavorite : item.sections.includes(section),
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
