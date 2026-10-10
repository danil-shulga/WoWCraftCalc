import type { AcquisitionMethod, ItemCatalog, ItemId, RecipeLine } from './item.types'

export interface ItemCostBreakdown {
  purchaseUnitCost: number | null
  craftUnitCost: number | null
}

function hasCycle(path: ReadonlySet<ItemId>, itemId: ItemId): boolean {
  return path.has(itemId)
}

function getExactUnitCost(
  catalog: ItemCatalog,
  itemId: ItemId,
  acquisition: AcquisitionMethod,
  path: ReadonlySet<ItemId>,
): number | null {
  const item = catalog[itemId]

  if (item === undefined) {
    return null
  }

  return acquisition === 'buy'
    ? item.purchasePriceCopper
    : getExactCraftUnitCost(catalog, itemId, path)
}

function getExactCraftUnitCost(
  catalog: ItemCatalog,
  itemId: ItemId,
  path: ReadonlySet<ItemId> = new Set(),
): number | null {
  const item = catalog[itemId]

  if (item?.recipe === undefined || item.recipe === null || hasCycle(path, itemId)) {
    return null
  }

  const nextPath = new Set(path)
  nextPath.add(itemId)

  let batchCost = 0

  for (const line of item.recipe.reagents) {
    const unitCost = getExactUnitCost(catalog, line.itemId, line.acquisition, nextPath)

    if (unitCost === null) {
      return null
    }

    batchCost += unitCost * line.quantity
  }

  return batchCost / item.recipe.outputQuantity
}

export function getCraftUnitCost(
  catalog: ItemCatalog,
  itemId: ItemId,
  path: ReadonlySet<ItemId> = new Set(),
): number | null {
  const exactCost = getExactCraftUnitCost(catalog, itemId, path)

  return exactCost === null ? null : Math.round(exactCost)
}

export function getSelectedUnitCost(
  catalog: ItemCatalog,
  itemId: ItemId,
  acquisition: AcquisitionMethod,
  path: ReadonlySet<ItemId> = new Set(),
): number | null {
  const exactCost = getExactUnitCost(catalog, itemId, acquisition, path)

  return exactCost === null ? null : Math.round(exactCost)
}

export function getRecipeLineCost(
  catalog: ItemCatalog,
  line: RecipeLine,
  path: ReadonlySet<ItemId> = new Set(),
): number | null {
  const unitCost = getExactUnitCost(catalog, line.itemId, line.acquisition, path)

  return unitCost === null ? null : Math.round(unitCost * line.quantity)
}

export function getRecipeBatchCost(catalog: ItemCatalog, itemId: ItemId): number | null {
  const item = catalog[itemId]
  const unitCost = getExactCraftUnitCost(catalog, itemId)

  if (item?.recipe === undefined || item.recipe === null || unitCost === null) {
    return null
  }

  return Math.round(unitCost * item.recipe.outputQuantity)
}

export function getProfitPerCraft(catalog: ItemCatalog, itemId: ItemId): number | null {
  const item = catalog[itemId]
  const batchCost = getRecipeBatchCost(catalog, itemId)

  if (
    item?.recipe === undefined ||
    item.recipe === null ||
    item.salePriceCopper === null ||
    batchCost === null
  ) {
    return null
  }

  return item.salePriceCopper * item.recipe.outputQuantity - batchCost
}

export function getItemCostBreakdown(
  catalog: ItemCatalog,
  itemId: ItemId,
): ItemCostBreakdown {
  return {
    purchaseUnitCost: catalog[itemId]?.purchasePriceCopper ?? null,
    craftUnitCost: getCraftUnitCost(catalog, itemId),
  }
}
