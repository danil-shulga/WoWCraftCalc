import { getExactCraftUnitCost } from './calculations'
import { calculateDisenchantComparison, getDisenchantProfit } from './disenchanting'
import type { DisenchantResult } from './disenchanting'
import { TBC_DISENCHANT_RULES } from './disenchanting-tbc'
import type { GameVersion } from './game-version'
import type { Item, ItemCatalog, ItemId } from './item.types'
import type { Profession } from './professions'
import { resolveItemPrice } from './tsm'
import type { PriceContext } from './tsm'

export interface DisenchantMaterialIssue {
  itemId: number
  kind: 'missing-material' | 'ambiguous-material' | 'missing-price'
  candidates: ItemId[]
}

export interface CatalogDisenchantCalculation {
  result: DisenchantResult
  configuredProfit: number | null
  buyProfit: number | null
  allProfessionsProfit: number | null
  boughtReagentsProfit: number | null
  materialIssues: DisenchantMaterialIssue[]
}

const materialIds = [
  ...new Set(
    TBC_DISENCHANT_RULES.rules.flatMap(({ outcomes }) =>
      outcomes.map(({ itemId }) => itemId),
    ),
  ),
]

export function resolveDisenchantMaterialPrices(
  catalog: ItemCatalog,
  prices?: PriceContext,
) {
  const candidates = new Map<number, Item[]>()
  for (const item of Object.values(catalog)) {
    const source = item.source
    if (
      !source ||
      (source.wowheadVersion !== undefined && source.wowheadVersion !== 'tbc')
    )
      continue
    const entries = candidates.get(source.wowheadItemId) ?? []
    entries.push(item)
    candidates.set(source.wowheadItemId, entries)
  }
  const salePrices = new Map<number, number | null>()
  const issues: DisenchantMaterialIssue[] = []
  for (const itemId of materialIds) {
    const matches = candidates.get(itemId) ?? []
    const only = matches.length === 1 ? matches[0] : undefined
    const price = only ? resolveItemPrice(only, 'salePriceCopper', prices) : null
    salePrices.set(itemId, price)
    if (price === null)
      issues.push({
        itemId,
        kind:
          matches.length === 0
            ? 'missing-material'
            : matches.length > 1
              ? 'ambiguous-material'
              : 'missing-price',
        candidates: matches.map(({ id }) => id),
      })
  }
  return { salePrices, issues }
}

export function createCatalogDisenchantSnapshot(
  catalog: ItemCatalog,
  version: GameVersion,
  itemIds: readonly ItemId[],
  ownedProfessions: ReadonlySet<Profession>,
  prices?: PriceContext,
): Record<ItemId, CatalogDisenchantCalculation> {
  const { salePrices, issues } = resolveDisenchantMaterialPrices(catalog, prices)
  const snapshot: Record<ItemId, CatalogDisenchantCalculation> = {}
  for (const itemId of itemIds) {
    const item = catalog[itemId]
    if (!item) continue
    const comparison = calculateDisenchantComparison(
      catalog,
      itemId,
      version,
      salePrices,
      { acceptUniformQuantities: true, ownedProfessions, prices },
    )
    const {
      disenchant: result,
      buyProfitCopper: buyProfit,
      craftProfitCopper,
    } = comparison
    snapshot[itemId] = {
      result,
      configuredProfit: item.recipe === null ? buyProfit : craftProfitCopper,
      buyProfit,
      allProfessionsProfit: getDisenchantProfit(
        result,
        getExactCraftUnitCost(catalog, itemId, { prices, scenario: 'all-professions' }),
      ),
      boughtReagentsProfit: getDisenchantProfit(
        result,
        getExactCraftUnitCost(catalog, itemId, { prices, scenario: 'buy-reagents' }),
      ),
      materialIssues: issues.filter((issue) =>
        result.missingPriceItemIds.includes(issue.itemId),
      ),
    }
  }
  return snapshot
}
