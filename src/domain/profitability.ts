import { getExactCraftUnitCost } from './calculations'
import { calculateDisenchant, type DisenchantResult } from './disenchanting'
import { resolveDisenchantMaterialPrices } from './disenchanting-catalog'
import { getItemRecipe } from './essence-conversion'
import type { ItemCatalog, ItemId } from './item.types'
import type { Profession } from './professions'
import { getTsmPrice, resolveItemPrice, usesTsmPrice, type PriceContext } from './tsm'

export const PROFITABILITY_MODES = ['buy', 'sell', 'craft', 'disenchant'] as const
export type ProfitabilityMode = (typeof PROFITABILITY_MODES)[number]
export const PROFITABILITY_FEE_PERCENT = 5

export interface ProfitabilityRow {
  itemId: ItemId
  mode: ProfitabilityMode
  cost: number | null
  craftCost: number | null
  gross: number | null
  costSource: 'manual' | 'tsm' | 'recipe'
  saleSource: 'manual' | 'tsm' | 'materials'
  issue: string | null
  disenchant: DisenchantResult | null
}

export interface ProfitabilityResult extends ProfitabilityRow {
  gain: number | null
  percent: number | null
}

const validMoney = (value: number | null): value is number =>
  value !== null &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= Number.MAX_SAFE_INTEGER

export function createProfitabilitySnapshot(
  catalog: ItemCatalog,
  mode: ProfitabilityMode,
  ownedProfessions: ReadonlySet<Profession>,
  prices: PriceContext,
): ProfitabilityRow[] {
  const cache = new Map<ItemId, number | null>()
  const materialPrices =
    mode === 'disenchant'
      ? resolveDisenchantMaterialPrices(catalog, prices.version, prices)
      : null
  const recent = {
    ...prices,
    settings: { ...prices.settings, metric: 'recent' as const },
  }
  const market = {
    ...prices,
    settings: { ...prices.settings, metric: 'marketValue' as const },
  }
  const rows: ProfitabilityRow[] = []
  for (const item of Object.values(catalog)) {
    const recipe = mode === 'craft' ? getItemRecipe(catalog, item.id) : null
    if (mode === 'craft' && !recipe) continue
    if (mode === 'disenchant' && !item.sections.includes('disenchanting')) continue
    const row: ProfitabilityRow = {
      itemId: item.id,
      mode,
      cost: null,
      craftCost: null,
      gross: null,
      costSource: 'manual',
      saleSource: 'manual',
      issue: null,
      disenchant: null,
    }
    if (mode === 'buy' || mode === 'sell') {
      row.cost = getTsmPrice(item, mode === 'buy' ? recent : market)
      row.gross = getTsmPrice(item, mode === 'buy' ? market : recent)
      row.costSource = 'tsm'
      row.saleSource = 'tsm'
      if (!item.source) row.issue = 'У предмета нет игрового ID.'
      else if (
        item.source.wowheadVersion !== undefined &&
        item.source.wowheadVersion !== prices.version
      )
        row.issue = 'Источник предмета относится к другой версии игры.'
      else if (!prices.settings.market || !prices.snapshot)
        row.issue = 'Нет снимка выбранного рынка TSM.'
      else if (row.cost === null || row.gross === null)
        row.issue =
          'Для сравнения нужны оба показателя TSM своего рынка: текущая и рыночная цены.'
    } else if (mode === 'craft') {
      row.costSource = 'recipe'
      row.cost = getExactCraftUnitCost(
        catalog,
        item.id,
        {
          prices,
          ownedProfessions,
        },
        new Set(),
        cache,
      )
      row.gross = resolveItemPrice(item, 'salePriceCopper', prices)
      row.saleSource = usesTsmPrice(item, 'salePriceCopper', prices) ? 'tsm' : 'manual'
      if (row.cost === null)
        row.issue =
          'Не удалось рассчитать себестоимость: проверьте рецепт и цены реагентов.'
      else if (row.gross === null) row.issue = 'Не указана цена продажи.'
    } else if (materialPrices) {
      row.cost = resolveItemPrice(item, 'purchasePriceCopper', prices)
      row.costSource = usesTsmPrice(item, 'purchasePriceCopper', prices)
        ? 'tsm'
        : 'manual'
      if (getItemRecipe(catalog, item.id)) {
        row.craftCost = getExactCraftUnitCost(
          catalog,
          item.id,
          { prices, ownedProfessions },
          new Set(),
          cache,
        )
      }
      row.saleSource = 'materials'
      const result = calculateDisenchant(
        item,
        prices.version,
        materialPrices.salePrices,
        {
          acceptUniformQuantities: true,
        },
      )
      row.disenchant = result
      row.gross = result.exactExpectedValueCopper
      if (result.status !== 'supported') {
        const reasons = {
          'not-disenchantable': 'Этот предмет нельзя распылить.',
          'missing-metadata': 'Недостаточно метаданных предмета для распыления.',
          'unsupported-rule': 'Правило распыления этого предмета не поддерживается.',
          'unsupported-version':
            'Версия распыления или источник предмета не поддерживается.',
        }
        row.issue = reasons[result.status]
      } else if (row.gross === null) {
        const issues = materialPrices.issues.filter((issue) =>
          result.missingPriceItemIds.includes(issue.itemId),
        )
        row.issue =
          issues
            .map(
              (issue) =>
                `${String(issue.itemId)}: ${
                  issue.kind === 'ambiguous-material'
                    ? 'неоднозначный игровой ID материала'
                    : issue.kind === 'missing-material'
                      ? 'материал отсутствует в каталоге'
                      : 'нет цены продажи материала'
                }`,
            )
            .join('; ') || 'Неизвестен полный выход материалов.'
      } else if (!validMoney(row.cost) && !validMoney(row.craftCost))
        row.issue = 'Неизвестны цена покупки и себестоимость крафта предмета.'
    }
    if (
      !row.issue &&
      ((!validMoney(row.cost) && !(mode === 'disenchant' && validMoney(row.craftCost))) ||
        !validMoney(row.gross))
    )
      row.issue = 'Некорректная или слишком большая сумма расчёта.'
    if (!validMoney(row.cost)) row.cost = null
    if (!validMoney(row.craftCost)) row.craftCost = null
    if (!validMoney(row.gross)) row.gross = null
    rows.push(row)
  }
  return rows
}

export function calculateProfitability(row: ProfitabilityRow): ProfitabilityResult {
  const empty = { ...row, gain: null, percent: null }
  const cost =
    row.mode === 'disenchant' && validMoney(row.craftCost)
      ? validMoney(row.cost)
        ? Math.min(row.cost, row.craftCost)
        : row.craftCost
      : row.cost
  if (row.issue || !validMoney(cost) || !validMoney(row.gross)) return empty
  const net = row.gross * (1 - PROFITABILITY_FEE_PERCENT / 100)
  const gain = net - cost
  const denominator = row.mode === 'buy' ? row.gross : cost
  const difference =
    row.mode === 'buy' ? cost - row.gross : row.mode === 'sell' ? row.gross - cost : gain
  const percent = denominator === 0 ? null : (difference / denominator) * 100
  if (
    !Number.isFinite(gain) ||
    Math.abs(gain) > Number.MAX_SAFE_INTEGER ||
    (percent !== null && !Number.isFinite(percent))
  )
    return { ...empty, issue: 'Сумма или процент выходит за допустимые границы.' }
  return { ...row, gain, percent }
}
