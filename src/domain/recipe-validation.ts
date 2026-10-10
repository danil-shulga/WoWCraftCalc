import type { ItemCatalog, ItemId, RecipeLine } from './item.types'

function canReachItem(
  catalog: ItemCatalog,
  fromItemId: ItemId,
  targetItemId: ItemId,
  visited: Set<ItemId>,
): boolean {
  if (fromItemId === targetItemId) {
    return true
  }

  if (visited.has(fromItemId)) {
    return false
  }

  visited.add(fromItemId)

  const recipe = catalog[fromItemId]?.recipe

  return (
    recipe?.reagents.some((line) =>
      canReachItem(catalog, line.itemId, targetItemId, visited),
    ) ?? false
  )
}

export function recipeWouldCreateCycle(
  catalog: ItemCatalog,
  ownerItemId: ItemId,
  reagents: readonly RecipeLine[],
): boolean {
  return reagents.some((line) =>
    canReachItem(catalog, line.itemId, ownerItemId, new Set()),
  )
}

export function getRecipeValidationError(
  catalog: ItemCatalog,
  ownerItemId: ItemId,
  reagents: readonly RecipeLine[],
): string | null {
  if (reagents.length === 0) {
    return 'Добавьте хотя бы один реагент'
  }

  const reagentIds = new Set<ItemId>()

  for (const line of reagents) {
    if (catalog[line.itemId] === undefined) {
      return 'Один из реагентов отсутствует в каталоге'
    }

    if (reagentIds.has(line.itemId)) {
      return 'Один предмет нельзя добавить в рецепт дважды'
    }

    reagentIds.add(line.itemId)
  }

  if (recipeWouldCreateCycle(catalog, ownerItemId, reagents)) {
    return 'Этот рецепт создаёт циклическую зависимость'
  }

  return null
}

export function getCatalogValidationError(catalog: ItemCatalog): string | null {
  for (const [catalogId, item] of Object.entries(catalog)) {
    if (catalogId !== item.id) {
      return `Идентификатор предмета «${item.name}» повреждён`
    }

    if (item.recipe === null) {
      continue
    }

    const recipeError = getRecipeValidationError(catalog, item.id, item.recipe.reagents)

    if (recipeError !== null) {
      return `Ошибка в рецепте «${item.name}»: ${recipeError}`
    }
  }

  return null
}
