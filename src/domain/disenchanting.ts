import type { GameVersion } from './game-version'
import type { Item, ItemCatalog, ItemId } from './item.types'
import { getExactCraftUnitCost } from './calculations'
import type { CalculationOptions } from './calculations'
import { resolveItemPrice } from './tsm'
import { TBC_DISENCHANT_RULES } from './disenchanting-tbc'
import { parseDisenchantRuleSet } from './disenchanting.schema'
import type {
  DisenchantQuantity,
  DisenchantRule,
  DisenchantRuleSet,
} from './disenchanting.schema'

export type DisenchantItem = Pick<
  Item,
  'source' | 'qualityId' | 'itemLevel' | 'classId' | 'subclassId' | 'inventoryType'
>

export type DisenchantSelection =
  | {
      status: 'supported'
      rule: DisenchantRule
      revision: string
      basis: 'reference-model'
    }
  | { status: 'not-disenchantable'; evidenceIds: string[] }
  | { status: 'missing-metadata'; fields: string[] }
  | { status: 'unsupported-rule' | 'unsupported-version' }

export function selectDisenchantRule(
  item: DisenchantItem,
  version: GameVersion,
  ruleSet: DisenchantRuleSet = TBC_DISENCHANT_RULES,
): DisenchantSelection {
  if (
    version !== 'tbc' ||
    (item.source?.wowheadVersion != null && item.source.wowheadVersion !== version)
  ) {
    return { status: 'unsupported-version' }
  }
  const set = parseDisenchantRuleSet(ruleSet)
  const gameId = item.source?.wowheadItemId
  if (gameId == null || !Number.isSafeInteger(gameId) || gameId < 1) {
    return { status: 'missing-metadata', fields: ['source.wowheadItemId'] }
  }
  const override = set.overrides.find(({ itemId }) => itemId === gameId)
  if (override?.kind === 'deny') {
    return { status: 'not-disenchantable', evidenceIds: override.evidenceIds }
  }
  const supported = (rule: DisenchantRule): DisenchantSelection => ({
    status: 'supported',
    rule,
    revision: set.revision,
    basis: 'reference-model',
  })
  if (override?.kind === 'rule') {
    const rule = set.rules.find(({ id }) => id === override.ruleId)
    if (rule) return supported(rule)
  }
  const fields = (
    ['qualityId', 'itemLevel', 'classId', 'subclassId', 'inventoryType'] as const
  ).filter((field) => {
    const value = item[field]
    return value == null || !Number.isSafeInteger(value) || value < 0
  })
  if (fields.length > 0) return { status: 'missing-metadata', fields }
  const rule = set.rules.find(
    (candidate) =>
      candidate.qualityId === item.qualityId &&
      item.itemLevel != null &&
      candidate.itemLevel.min <= item.itemLevel &&
      item.itemLevel <= candidate.itemLevel.max &&
      candidate.equipment.some(
        (group) =>
          group.classId === item.classId &&
          item.subclassId != null &&
          group.subclassIds.includes(item.subclassId) &&
          item.inventoryType != null &&
          group.inventoryTypes.includes(item.inventoryType),
      ),
  )
  return rule ? supported(rule) : { status: 'unsupported-rule' }
}

export interface DisenchantOptions {
  quantity?: number
  // Opt in explicitly: the observed ranges do not establish a uniform distribution.
  acceptUniformQuantities?: boolean
}

export interface DisenchantMaterialEstimate {
  itemId: number
  chance: DisenchantRule['outcomes'][number]['chance']
  quantity: DisenchantQuantity
  rangeOnDrop: { min: number; max: number }
  expectedQuantity: number | null
  salePriceCopper: number | null
  exactValueCopper: number | null
}

interface DisenchantEstimate {
  quantity: number
  materials: DisenchantMaterialEstimate[]
  assumptions: 'uniform-quantities'[]
  missingPriceItemIds: number[]
  unknownQuantityItemIds: number[]
  exactExpectedValueCopper: number | null
  expectedValueCopper: number | null
  knownValueCopper: number | null
}

export type DisenchantResult = DisenchantSelection & DisenchantEstimate

interface Fraction {
  numerator: bigint
  denominator: bigint
}

function fraction(numerator: bigint, denominator: bigint): Fraction {
  let a = numerator
  let b = denominator
  while (b !== 0n) [a, b] = [b, a % b]
  return { numerator: numerator / a, denominator: denominator / a }
}

function addFractions(a: Fraction, b: Fraction): Fraction {
  return fraction(
    a.numerator * b.denominator + b.numerator * a.denominator,
    a.denominator * b.denominator,
  )
}

function fractionAmount(value: Fraction): number {
  if (value.numerator > BigInt(Number.MAX_SAFE_INTEGER) * value.denominator) {
    throw new RangeError('Результат дизенчанта выходит за безопасный диапазон')
  }
  return safeAmount(Number(value.numerator) / Number(value.denominator))
}

function roundFraction(value: Fraction): number {
  return Number((2n * value.numerator + value.denominator) / (2n * value.denominator))
}

function safeAmount(value: number): number {
  if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) {
    throw new RangeError('Результат дизенчанта выходит за безопасный диапазон')
  }
  return value
}

function quantityRange(distribution: DisenchantQuantity): { min: number; max: number } {
  switch (distribution.kind) {
    case 'fixed':
      return { min: distribution.quantity, max: distribution.quantity }
    case 'uniform-model':
    case 'unknown':
      return distribution.range
    case 'weighted-model':
      return {
        min: Math.min(...distribution.weights.map(({ quantity }) => quantity)),
        max: Math.max(...distribution.weights.map(({ quantity }) => quantity)),
      }
  }
}

function meanQuantity(
  distribution: DisenchantQuantity,
  acceptUniform: boolean,
): Fraction | null {
  switch (distribution.kind) {
    case 'fixed':
      return fraction(BigInt(distribution.quantity), 1n)
    case 'uniform-model':
      return acceptUniform
        ? fraction(BigInt(distribution.range.min) + BigInt(distribution.range.max), 2n)
        : null
    case 'weighted-model': {
      return fraction(
        distribution.weights.reduce(
          (sum, { quantity, weight }) => sum + BigInt(quantity) * BigInt(weight),
          0n,
        ),
        distribution.weights.reduce((sum, { weight }) => sum + BigInt(weight), 0n),
      )
    }
    case 'unknown':
      return null
  }
}

/** Prices are resolved by the caller, keyed by TBC game ID (never by local ID or name). */
export function calculateDisenchant(
  item: DisenchantItem,
  version: GameVersion,
  salePrices: ReadonlyMap<number, number | null>,
  options: DisenchantOptions = {},
  ruleSet: DisenchantRuleSet = TBC_DISENCHANT_RULES,
): DisenchantResult {
  const quantity = options.quantity ?? 1
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw new RangeError('Укажите положительное безопасное целое количество предметов')
  }
  const selection = selectDisenchantRule(item, version, ruleSet)
  if (selection.status !== 'supported') {
    return {
      ...selection,
      quantity,
      materials: [],
      assumptions: [],
      missingPriceItemIds: [],
      unknownQuantityItemIds: [],
      exactExpectedValueCopper: null,
      expectedValueCopper: null,
      knownValueCopper: null,
    }
  }
  const estimates = selection.rule.outcomes.map((outcome) => {
    const salePriceCopper = salePrices.get(outcome.itemId) ?? null
    if (
      salePriceCopper !== null &&
      (!Number.isSafeInteger(salePriceCopper) || salePriceCopper < 0)
    ) {
      throw new RangeError(
        'Цена материала должна быть неотрицательным безопасным целым числом меди',
      )
    }
    const mean = meanQuantity(outcome.quantity, options.acceptUniformQuantities === true)
    const expected =
      outcome.chance.numerator === 0
        ? fraction(0n, 1n)
        : mean === null
          ? null
          : fraction(
              BigInt(outcome.chance.numerator) * mean.numerator * BigInt(quantity),
              BigInt(outcome.chance.denominator) * mean.denominator,
            )
    const value =
      expected?.numerator === 0n
        ? fraction(0n, 1n)
        : expected === null || salePriceCopper === null
          ? null
          : fraction(expected.numerator * BigInt(salePriceCopper), expected.denominator)
    const material: DisenchantMaterialEstimate = {
      ...outcome,
      rangeOnDrop: quantityRange(outcome.quantity),
      expectedQuantity: expected === null ? null : fractionAmount(expected),
      salePriceCopper,
      exactValueCopper: value === null ? null : fractionAmount(value),
    }
    return {
      material,
      value,
    }
  })
  const materials = estimates.map(({ material }) => material)
  const missingPriceItemIds = materials
    .filter((row) => row.chance.numerator > 0 && row.salePriceCopper === null)
    .map(({ itemId }) => itemId)
  const unknownQuantityItemIds = materials
    .filter((row) => row.expectedQuantity === null)
    .map(({ itemId }) => itemId)
  const knownValueFraction = estimates.reduce(
    (sum, { value }) => (value === null ? sum : addFractions(sum, value)),
    fraction(0n, 1n),
  )
  const knownValue = fractionAmount(knownValueFraction)
  const exactExpectedValueCopper = materials.every((row) => row.exactValueCopper !== null)
    ? knownValue
    : null
  return {
    ...selection,
    quantity,
    materials,
    assumptions:
      options.acceptUniformQuantities === true &&
      materials.some(
        (row) => row.quantity.kind === 'uniform-model' && row.chance.numerator > 0,
      )
        ? ['uniform-quantities']
        : [],
    missingPriceItemIds,
    unknownQuantityItemIds,
    exactExpectedValueCopper,
    expectedValueCopper:
      exactExpectedValueCopper === null ? null : roundFraction(knownValueFraction),
    knownValueCopper: roundFraction(knownValueFraction),
  }
}

/** Independent expected gross profits, before auction fees. No random-output planning. */
export function getDisenchantProfit(
  disenchant: DisenchantResult,
  unitCost: number | null,
): number | null {
  return disenchant.exactExpectedValueCopper === null || unitCost === null
    ? null
    : Math.round(
        safeAmount(
          disenchant.exactExpectedValueCopper -
            safeAmount(unitCost * disenchant.quantity),
        ),
      )
}

export function calculateDisenchantComparison(
  catalog: ItemCatalog,
  itemId: ItemId,
  version: GameVersion,
  salePrices: ReadonlyMap<number, number | null>,
  options: DisenchantOptions & CalculationOptions = {},
): {
  disenchant: DisenchantResult
  buyProfitCopper: number | null
  craftProfitCopper: number | null
} {
  const item = catalog[itemId]
  const disenchant = calculateDisenchant(item ?? {}, version, salePrices, options)
  return {
    disenchant,
    buyProfitCopper: getDisenchantProfit(
      disenchant,
      item ? resolveItemPrice(item, 'purchasePriceCopper', options.prices) : null,
    ),
    craftProfitCopper: getDisenchantProfit(
      disenchant,
      getExactCraftUnitCost(catalog, itemId, options),
    ),
  }
}
