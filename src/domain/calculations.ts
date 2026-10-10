import type { AcquisitionMethod, ItemCatalog, ItemId } from './item.types'
import type { Profession } from './professions'

export interface ItemCalculationSnapshot {
  craftUnitCost: number | null
  selectedUnitCosts: Record<AcquisitionMethod, number | null>
  automaticMethod: Exclude<AcquisitionMethod, 'auto'>
  configuredProfit: number | null
  allProfessionsProfit: number | null
  boughtReagentsProfit: number | null
}

export type CatalogCalculationSnapshot = Record<ItemId, ItemCalculationSnapshot>

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
  craftCostCache: Map<ItemId, number | null>,
): number | null {
  const item = catalog[itemId]

  if (item === undefined) {
    return null
  }

  return resolveAcquisitionMethod(catalog, itemId, acquisition, options) === 'buy'
    ? item.purchasePriceCopper
    : getExactCraftUnitCost(catalog, itemId, options, path, craftCostCache)
}

function getExactCraftUnitCost(
  catalog: ItemCatalog,
  itemId: ItemId,
  options: CalculationOptions,
  path: ReadonlySet<ItemId> = new Set(),
  craftCostCache: Map<ItemId, number | null> = new Map<ItemId, number | null>(),
): number | null {
  const item = catalog[itemId]

  if (
    item?.recipe === undefined ||
    item.recipe === null ||
    item.recipe.reagents.length === 0 ||
    path.has(itemId)
  ) {
    return null
  }

  if (craftCostCache.has(itemId)) {
    return craftCostCache.get(itemId) ?? null
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
      craftCostCache,
    )

    if (unitCost === null) {
      craftCostCache.set(itemId, null)
      return null
    }

    batchCost += unitCost * line.quantity
  }

  const unitCost = batchCost / item.recipe.outputQuantity
  craftCostCache.set(itemId, unitCost)

  return unitCost
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
  const exactCost = getExactUnitCost(
    catalog,
    itemId,
    acquisition,
    options,
    new Set(),
    new Map(),
  )

  return exactCost === null ? null : Math.round(exactCost)
}

function getProfitWithCache(
  catalog: ItemCatalog,
  itemId: ItemId,
  options: CalculationOptions,
  craftCostCache: Map<ItemId, number | null>,
): number | null {
  const item = catalog[itemId]
  const unitCost = getExactCraftUnitCost(
    catalog,
    itemId,
    options,
    new Set(),
    craftCostCache,
  )

  if (
    item?.recipe === undefined ||
    item.recipe === null ||
    item.salePriceCopper === null
  ) {
    return null
  }

  const batchCost =
    unitCost === null ? null : Math.round(unitCost * item.recipe.outputQuantity)

  return batchCost === null
    ? null
    : item.salePriceCopper * item.recipe.outputQuantity - batchCost
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

export function createCatalogCalculationSnapshot(
  catalog: ItemCatalog,
  ownedProfessions: ReadonlySet<Profession>,
  profitItemIds: ReadonlySet<ItemId>,
): CatalogCalculationSnapshot {
  const configuredOptions = { ownedProfessions }
  const allProfessionsOptions = { scenario: 'all-professions' as const }
  const buyReagentsOptions = { scenario: 'buy-reagents' as const }
  const configuredCache = new Map<ItemId, number | null>()
  const allProfessionsCache = new Map<ItemId, number | null>()
  const buyReagentsCache = new Map<ItemId, number | null>()

  return Object.fromEntries(
    Object.keys(catalog).map((itemId) => {
      const automaticMethod = getAutomaticAcquisitionMethod(
        catalog,
        itemId,
        ownedProfessions,
      )
      const exactCraftCost = getExactCraftUnitCost(
        catalog,
        itemId,
        configuredOptions,
        new Set(),
        configuredCache,
      )
      const exactAutomaticCost = getExactUnitCost(
        catalog,
        itemId,
        'auto',
        configuredOptions,
        new Set(),
        configuredCache,
      )
      const craftUnitCost = exactCraftCost === null ? null : Math.round(exactCraftCost)

      return [
        itemId,
        {
          craftUnitCost,
          selectedUnitCosts: {
            auto: exactAutomaticCost === null ? null : Math.round(exactAutomaticCost),
            buy: catalog[itemId]?.purchasePriceCopper ?? null,
            craft: craftUnitCost,
          },
          automaticMethod,
          configuredProfit: profitItemIds.has(itemId)
            ? getProfitWithCache(catalog, itemId, configuredOptions, configuredCache)
            : null,
          allProfessionsProfit: profitItemIds.has(itemId)
            ? getProfitWithCache(
                catalog,
                itemId,
                allProfessionsOptions,
                allProfessionsCache,
              )
            : null,
          boughtReagentsProfit: profitItemIds.has(itemId)
            ? getProfitWithCache(catalog, itemId, buyReagentsOptions, buyReagentsCache)
            : null,
        },
      ]
    }),
  )
}
