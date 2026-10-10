import type { AcquisitionMethod, ItemCatalog, ItemId, RecipeLine } from './item.types'
import type { Profession } from './professions'

export interface ItemCostBreakdown {
  purchaseUnitCost: number | null
  craftUnitCost: number | null
}

export type CalculationScenario = 'configured' | 'all-professions' | 'buy-reagents'

export interface CalculationOptions {
  ownedProfessions?: ReadonlySet<Profession>
  scenario?: CalculationScenario
}

const noProfessions = new Set<Profession>()

function resolveAcquisitionMethod(
  catalog: ItemCatalog,
  itemId: ItemId,
  acquisition: AcquisitionMethod,
  options: CalculationOptions,
): Exclude<AcquisitionMethod, 'auto'> {
  const scenario = options.scenario ?? 'configured'

  if (scenario === 'buy-reagents') {
    return 'buy'
  }

  const item = catalog[itemId]
  const recipeProfession = item?.recipe?.profession
  const hasProfessionRecipe = recipeProfession != null

  if (scenario === 'all-professions') {
    return hasProfessionRecipe ? 'craft' : 'buy'
  }

  if (acquisition !== 'auto') {
    return acquisition
  }

  const ownedProfessions = options.ownedProfessions ?? noProfessions

  return recipeProfession != null && ownedProfessions.has(recipeProfession)
    ? 'craft'
    : 'buy'
}

export function getAutomaticAcquisitionMethod(
  catalog: ItemCatalog,
  itemId: ItemId,
  ownedProfessions: ReadonlySet<Profession>,
): Exclude<AcquisitionMethod, 'auto'> {
  return resolveAcquisitionMethod(catalog, itemId, 'auto', {
    ownedProfessions,
    scenario: 'configured',
  })
}

function getExactUnitCost(
  catalog: ItemCatalog,
  itemId: ItemId,
  acquisition: AcquisitionMethod,
  options: CalculationOptions,
  path: ReadonlySet<ItemId>,
): number | null {
  const item = catalog[itemId]

  if (item === undefined) {
    return null
  }

  return resolveAcquisitionMethod(catalog, itemId, acquisition, options) === 'buy'
    ? item.purchasePriceCopper
    : getExactCraftUnitCost(catalog, itemId, options, path)
}

function getExactCraftUnitCost(
  catalog: ItemCatalog,
  itemId: ItemId,
  options: CalculationOptions,
  path: ReadonlySet<ItemId> = new Set(),
): number | null {
  const item = catalog[itemId]

  if (item?.recipe === undefined || item.recipe === null || path.has(itemId)) {
    return null
  }

  const nextPath = new Set(path)
  nextPath.add(itemId)

  let batchCost = 0

  for (const line of item.recipe.reagents) {
    const unitCost = getExactUnitCost(
      catalog,
      line.itemId,
      line.acquisition,
      options,
      nextPath,
    )

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
  options: CalculationOptions = {},
): number | null {
  const exactCost = getExactCraftUnitCost(catalog, itemId, options)

  return exactCost === null ? null : Math.round(exactCost)
}

export function getSelectedUnitCost(
  catalog: ItemCatalog,
  itemId: ItemId,
  acquisition: AcquisitionMethod,
  options: CalculationOptions = {},
): number | null {
  const exactCost = getExactUnitCost(catalog, itemId, acquisition, options, new Set())

  return exactCost === null ? null : Math.round(exactCost)
}

export function getRecipeLineCost(
  catalog: ItemCatalog,
  line: RecipeLine,
  options: CalculationOptions = {},
): number | null {
  const unitCost = getExactUnitCost(
    catalog,
    line.itemId,
    line.acquisition,
    options,
    new Set(),
  )

  return unitCost === null ? null : Math.round(unitCost * line.quantity)
}

export function getRecipeBatchCost(
  catalog: ItemCatalog,
  itemId: ItemId,
  options: CalculationOptions = {},
): number | null {
  const item = catalog[itemId]
  const unitCost = getExactCraftUnitCost(catalog, itemId, options)

  if (item?.recipe === undefined || item.recipe === null || unitCost === null) {
    return null
  }

  return Math.round(unitCost * item.recipe.outputQuantity)
}

export function getProfitPerCraft(
  catalog: ItemCatalog,
  itemId: ItemId,
  options: CalculationOptions = {},
): number | null {
  const item = catalog[itemId]
  const batchCost = getRecipeBatchCost(catalog, itemId, options)

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
  options: CalculationOptions = {},
): ItemCostBreakdown {
  return {
    purchaseUnitCost: catalog[itemId]?.purchasePriceCopper ?? null,
    craftUnitCost: getCraftUnitCost(catalog, itemId, options),
  }
}
