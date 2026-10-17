import { getEssenceConversion, getItemRecipe } from './essence-conversion'
import type { AcquisitionMethod, ItemCatalog, ItemId } from './item.types'
import type { Profession } from './professions'
import { resolveItemPrice, usesTsmPrice } from './tsm'
import type { PriceContext } from './tsm'

export interface ItemCalculationSnapshot {
  purchasePrice: number | null
  salePrice: number | null
  purchaseIsTsm: boolean
  saleIsTsm: boolean
  craftUnitCost: number | null
  exactSelectedUnitProfits: Record<AcquisitionMethod, number | null>
  automaticMethod: Exclude<AcquisitionMethod, 'auto'>
  configuredProfit: number | null
  allProfessionsProfit: number | null
  boughtReagentsProfit: number | null
}

export type CatalogCalculationSnapshot = Record<ItemId, ItemCalculationSnapshot>

export type CalculationScenario = 'configured' | 'all-professions' | 'buy-reagents'

export interface CalculationOptions {
  prices?: PriceContext | undefined
  ownedProfessions?: ReadonlySet<Profession>
  scenario?: CalculationScenario
}

const noProfessions = new Set<Profession>()

function resolveAcquisitionMethod(
  catalog: ItemCatalog,
  itemId: ItemId,
  acquisition: AcquisitionMethod,
  options: CalculationOptions,
  automaticCraftUnitCost: number | null = null,
): Exclude<AcquisitionMethod, 'auto'> {
  const scenario = options.scenario ?? 'configured'

  if (scenario === 'buy-reagents') {
    return 'buy'
  }

  const item = catalog[itemId]
  const recipeProfession = getItemRecipe(catalog, itemId)?.profession
  const isConversion = getEssenceConversion(catalog, itemId) !== null
  const hasProfessionRecipe = recipeProfession != null

  if (scenario === 'all-professions') {
    return hasProfessionRecipe || isConversion ? 'craft' : 'buy'
  }

  if (acquisition !== 'auto') {
    return acquisition
  }

  const ownedProfessions = options.ownedProfessions ?? noProfessions
  const canCraftAutomatically =
    isConversion || (recipeProfession != null && ownedProfessions.has(recipeProfession))

  if (!canCraftAutomatically) {
    return 'buy'
  }

  const purchasePrice = item
    ? resolveItemPrice(item, 'purchasePriceCopper', options.prices)
    : null

  if (purchasePrice === null) {
    return 'craft'
  }

  return automaticCraftUnitCost !== null && automaticCraftUnitCost < purchasePrice
    ? 'craft'
    : 'buy'
}

export function getAutomaticAcquisitionMethod(
  catalog: ItemCatalog,
  itemId: ItemId,
  ownedProfessions: ReadonlySet<Profession>,
  prices?: PriceContext,
): Exclude<AcquisitionMethod, 'auto'> {
  const options = {
    prices,
    ownedProfessions,
    scenario: 'configured',
  } as const
  const craftUnitCost = getExactCraftUnitCost(catalog, itemId, options)

  return resolveAcquisitionMethod(catalog, itemId, 'auto', options, craftUnitCost)
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

  if (acquisition === 'auto' && (options.scenario ?? 'configured') === 'configured') {
    const craftUnitCost = getExactCraftUnitCost(
      catalog,
      itemId,
      options,
      path,
      craftCostCache,
    )
    const automaticMethod = resolveAcquisitionMethod(
      catalog,
      itemId,
      acquisition,
      options,
      craftUnitCost,
    )

    return automaticMethod === 'buy'
      ? resolveItemPrice(item, 'purchasePriceCopper', options.prices)
      : craftUnitCost
  }

  return resolveAcquisitionMethod(catalog, itemId, acquisition, options) === 'buy'
    ? resolveItemPrice(item, 'purchasePriceCopper', options.prices)
    : getExactCraftUnitCost(catalog, itemId, options, path, craftCostCache)
}

export function getExactCraftUnitCost(
  catalog: ItemCatalog,
  itemId: ItemId,
  options: CalculationOptions,
  path: ReadonlySet<ItemId> = new Set(),
  craftCostCache: Map<ItemId, number | null> = new Map<ItemId, number | null>(),
): number | null {
  const recipe = getItemRecipe(catalog, itemId)

  if (recipe === null || recipe.reagents.length === 0 || path.has(itemId)) {
    return null
  }

  if (craftCostCache.has(itemId)) {
    return craftCostCache.get(itemId) ?? null
  }

  const nextPath = new Set(path)
  nextPath.add(itemId)

  let batchCost = 0
  const isConversion = getEssenceConversion(catalog, itemId) !== null

  for (const line of recipe.reagents) {
    const reagent = catalog[line.itemId]
    const unitCost = isConversion
      ? reagent
        ? resolveItemPrice(reagent, 'purchasePriceCopper', options.prices)
        : null
      : getExactUnitCost(
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

  const unitCost = batchCost / recipe.outputQuantity
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

function getProfitWithCache(
  catalog: ItemCatalog,
  itemId: ItemId,
  options: CalculationOptions,
  craftCostCache: Map<ItemId, number | null>,
): number | null {
  const item = catalog[itemId]
  const recipe = getItemRecipe(catalog, itemId)
  const salePrice = item
    ? resolveItemPrice(item, 'salePriceCopper', options.prices)
    : null
  const unitCost = getExactCraftUnitCost(
    catalog,
    itemId,
    options,
    new Set(),
    craftCostCache,
  )

  if (recipe === null || salePrice === null) {
    return null
  }

  const batchCost =
    unitCost === null ? null : Math.round(unitCost * recipe.outputQuantity)

  return batchCost === null ? null : salePrice * recipe.outputQuantity - batchCost
}

export function getRecipeBatchCost(
  catalog: ItemCatalog,
  itemId: ItemId,
  options: CalculationOptions = {},
): number | null {
  const recipe = getItemRecipe(catalog, itemId)
  const unitCost = getExactCraftUnitCost(catalog, itemId, options)

  if (recipe === null || unitCost === null) {
    return null
  }

  return Math.round(unitCost * recipe.outputQuantity)
}

export function getProfitPerCraft(
  catalog: ItemCatalog,
  itemId: ItemId,
  options: CalculationOptions = {},
): number | null {
  const item = catalog[itemId]
  const recipe = getItemRecipe(catalog, itemId)
  const batchCost = getRecipeBatchCost(catalog, itemId, options)
  const salePrice = item
    ? resolveItemPrice(item, 'salePriceCopper', options.prices)
    : null

  if (recipe === null || salePrice === null || batchCost === null) {
    return null
  }

  return salePrice * recipe.outputQuantity - batchCost
}

function getExactUnitAcquisitionProfit(
  purchasePrice: number | null,
  craftUnitCost: number | null,
  selectedMethod: Exclude<AcquisitionMethod, 'auto'>,
): number | null {
  if (purchasePrice === null || craftUnitCost === null) {
    return null
  }

  return selectedMethod === 'buy'
    ? craftUnitCost - purchasePrice
    : purchasePrice - craftUnitCost
}

export function getTotalAcquisitionProfit(
  exactUnitProfit: number | null,
  quantity: number,
): number | null {
  return exactUnitProfit === null ? null : Math.round(exactUnitProfit * quantity)
}

export function createCatalogCalculationSnapshot(
  catalog: ItemCatalog,
  ownedProfessions: ReadonlySet<Profession>,
  profitItemIds: ReadonlySet<ItemId>,
  prices?: PriceContext,
): CatalogCalculationSnapshot {
  const configuredOptions = { ownedProfessions, prices }
  const allProfessionsOptions = { scenario: 'all-professions' as const, prices }
  const buyReagentsOptions = { scenario: 'buy-reagents' as const, prices }
  const configuredCache = new Map<ItemId, number | null>()
  const allProfessionsCache = new Map<ItemId, number | null>()
  const buyReagentsCache = new Map<ItemId, number | null>()

  return Object.fromEntries(
    Object.keys(catalog).map((itemId) => {
      const exactCraftCost = getExactCraftUnitCost(
        catalog,
        itemId,
        configuredOptions,
        new Set(),
        configuredCache,
      )
      const automaticMethod = resolveAcquisitionMethod(
        catalog,
        itemId,
        'auto',
        configuredOptions,
        exactCraftCost,
      )
      const craftUnitCost = exactCraftCost === null ? null : Math.round(exactCraftCost)
      const item = catalog[itemId]
      const purchasePrice = item
        ? resolveItemPrice(item, 'purchasePriceCopper', prices)
        : null
      const salePrice = item ? resolveItemPrice(item, 'salePriceCopper', prices) : null

      return [
        itemId,
        {
          purchasePrice,
          salePrice,
          purchaseIsTsm: item ? usesTsmPrice(item, 'purchasePriceCopper', prices) : false,
          saleIsTsm: item ? usesTsmPrice(item, 'salePriceCopper', prices) : false,
          craftUnitCost,
          exactSelectedUnitProfits: {
            auto: getExactUnitAcquisitionProfit(
              purchasePrice,
              exactCraftCost,
              automaticMethod,
            ),
            buy: getExactUnitAcquisitionProfit(purchasePrice, exactCraftCost, 'buy'),
            craft: getExactUnitAcquisitionProfit(purchasePrice, exactCraftCost, 'craft'),
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
