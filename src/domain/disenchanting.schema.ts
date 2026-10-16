import { z } from 'zod'

import { GAME_VERSION_REGISTRY } from './game-version'

const positiveInteger = z.number().int().positive()
const metadataInteger = z.number().int().nonnegative()
const range = z
  .object({ min: positiveInteger, max: positiveInteger })
  .refine(({ min, max }) => min <= max, 'Перевёрнутый диапазон')

export const disenchantQuantitySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('fixed'), quantity: positiveInteger }),
  z.object({ kind: z.literal('uniform-model'), range }),
  z
    .object({
      kind: z.literal('weighted-model'),
      weights: z
        .array(z.object({ quantity: positiveInteger, weight: positiveInteger }))
        .min(1),
    })
    .refine(
      ({ weights }) =>
        new Set(weights.map(({ quantity }) => quantity)).size === weights.length &&
        Number.isSafeInteger(weights.reduce((sum, { weight }) => sum + weight, 0)),
      'Повтор количества или небезопасная сумма весов',
    ),
  z.object({ kind: z.literal('unknown'), range }),
])

const equipmentSchema = z.object({
  classId: metadataInteger,
  subclassIds: z.array(metadataInteger).min(1),
  inventoryTypes: z.array(metadataInteger).min(1),
})

const ruleSchema = z.object({
  id: z.string().min(1),
  qualityId: metadataInteger,
  itemLevel: range,
  equipment: z.array(equipmentSchema).min(1),
  evidenceIds: z.array(z.string().min(1)).min(1),
  outcomes: z
    .array(
      z.object({
        itemId: positiveInteger,
        chance: z.object({ numerator: metadataInteger, denominator: positiveInteger }),
        quantity: disenchantQuantitySchema,
      }),
    )
    .min(1),
})

const evidenceSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['reference-model', 'observation', 'exclusion-source']),
  url: z.url(),
  checkedAt: z.iso.date(),
  itemIds: z.array(positiveInteger),
  note: z.string().min(1),
  observations: z
    .array(
      z.object({
        itemId: positiveInteger,
        materialItemId: positiveInteger,
        count: metadataInteger,
        total: positiveInteger,
        range,
      }),
    )
    .default([]),
})

export const disenchantRuleSetSchema = z
  .object({
    schemaVersion: z.literal(1),
    gameVersion: z.literal('tbc'),
    build: z.literal(GAME_VERSION_REGISTRY.tbc.build),
    revision: z.string().min(1),
    rules: z.array(ruleSchema).min(1),
    overrides: z.array(
      z.discriminatedUnion('kind', [
        z.object({
          kind: z.literal('deny'),
          itemId: positiveInteger,
          flags: metadataInteger,
          evidenceIds: z.array(z.string().min(1)).min(1),
        }),
        z.object({
          kind: z.literal('rule'),
          itemId: positiveInteger,
          ruleId: z.string().min(1),
          evidenceIds: z.array(z.string().min(1)).min(1),
        }),
      ]),
    ),
    evidence: z.array(evidenceSchema).min(1),
  })
  .superRefine((set, ctx) => {
    const issue = (message: string) => {
      ctx.addIssue({ code: 'custom', message })
    }
    const unique = (values: (string | number)[]) => new Set(values).size === values.length
    if (!unique(set.rules.map(({ id }) => id))) issue('Повтор ID правила')
    if (!unique(set.evidence.map(({ id }) => id))) issue('Повтор ID свидетельства')
    if (!unique(set.overrides.map(({ itemId }) => itemId))) issue('Повтор исключения')
    const evidenceIds = new Set(set.evidence.map(({ id }) => id))
    for (const entry of [...set.rules, ...set.overrides]) {
      if (entry.evidenceIds.some((id) => !evidenceIds.has(id))) issue('Нет свидетельства')
    }
    for (const override of set.overrides) {
      if (
        override.kind === 'rule' &&
        !set.rules.some(({ id }) => id === override.ruleId)
      ) {
        issue('Нет правила исключения')
      }
    }
    for (const rule of set.rules) {
      if (!unique(rule.outcomes.map(({ itemId }) => itemId))) issue('Повтор материала')
      // Compare rational probabilities exactly, without accepting a nearly complete sum.
      let numerator = 0n
      let denominator = 1n
      for (const outcome of rule.outcomes) {
        const chance = outcome.chance
        if (chance.numerator > chance.denominator) issue('Вероятность больше 1')
        numerator =
          numerator * BigInt(chance.denominator) + BigInt(chance.numerator) * denominator
        denominator *= BigInt(chance.denominator)
      }
      if (numerator !== denominator) issue('Сумма вероятностей не равна 1')
    }
    const intersects = (a: number[], b: number[]) => a.some((value) => b.includes(value))
    for (const [index, rule] of set.rules.entries()) {
      for (const other of set.rules.slice(index + 1)) {
        if (
          rule.qualityId === other.qualityId &&
          rule.itemLevel.min <= other.itemLevel.max &&
          other.itemLevel.min <= rule.itemLevel.max &&
          rule.equipment.some((a) =>
            other.equipment.some(
              (b) =>
                a.classId === b.classId &&
                intersects(a.subclassIds, b.subclassIds) &&
                intersects(a.inventoryTypes, b.inventoryTypes),
            ),
          )
        )
          issue('Неоднозначные пересекающиеся правила')
      }
    }
  })

export type DisenchantRuleSet = z.output<typeof disenchantRuleSetSchema>
export type DisenchantRule = DisenchantRuleSet['rules'][number]
export type DisenchantQuantity = z.output<typeof disenchantQuantitySchema>

export function parseDisenchantRuleSet(value: unknown): DisenchantRuleSet {
  return disenchantRuleSetSchema.parse(value)
}
