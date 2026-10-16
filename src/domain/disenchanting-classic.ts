import exclusions from './disenchanting-classic-exclusions.json'
import { disenchantArmor, disenchantWeapons } from './disenchanting-equipment'
import { parseDisenchantRuleSet } from './disenchanting.schema'
import type { DisenchantQuantity, DisenchantRule } from './disenchanting.schema'

const equipment = [...disenchantArmor, ...disenchantWeapons]
const evidenceIds = ['classic-reference-model']

function rangeQuantity(min: number, max: number): DisenchantQuantity {
  return min === max
    ? { kind: 'fixed', quantity: min }
    : { kind: 'uniform-model', range: { min, max } }
}

// The last band stops at 65: higher green entries in the Era CSV are test items.
export const CLASSIC_COMMON_DISENCHANT_RULES: DisenchantRule[] = [
  ...(
    [
      // min, max, dust, dust min/max, essence, essence min/max, shard, armor/weapon dust %, shard %
      [1, 15, 10940, 1, 2, 10938, 1, 2, 0, 80, 20, 0],
      [16, 20, 10940, 2, 3, 10939, 1, 2, 10978, 75, 20, 5],
      [21, 25, 10940, 4, 6, 10998, 1, 2, 10978, 75, 15, 10],
      [26, 30, 11083, 1, 2, 11082, 1, 2, 11084, 75, 20, 5],
      [31, 35, 11083, 2, 5, 11134, 1, 2, 11138, 75, 20, 5],
      [36, 40, 11137, 1, 2, 11135, 1, 2, 11139, 75, 20, 5],
      [41, 45, 11137, 2, 5, 11174, 1, 2, 11177, 75, 20, 5],
      [46, 50, 11176, 1, 2, 11175, 1, 2, 11178, 75, 20, 5],
      [51, 55, 11176, 2, 5, 16202, 1, 2, 14343, 75, 22, 5],
      [56, 60, 16204, 1, 2, 16203, 1, 2, 14344, 75, 22, 5],
      [61, 65, 16204, 2, 5, 16203, 2, 3, 14344, 75, 22, 5],
    ] as const
  ).flatMap(
    ([
      min,
      max,
      dust,
      dustMin,
      dustMax,
      essence,
      essenceMin,
      essenceMax,
      shard,
      armorDust,
      weaponDust,
      armorShard,
    ]) => {
      return [false, true].map((weapon): DisenchantRule => {
        const dustChance = weapon ? weaponDust : armorDust
        const shardChance = weapon && min >= 51 ? 3 : armorShard
        return {
          id: `classic-uncommon-${weapon ? 'weapon' : 'armor'}-${String(min)}-${String(max)}`,
          qualityId: 2,
          itemLevel: { min, max },
          equipment: weapon ? disenchantWeapons : disenchantArmor,
          evidenceIds,
          outcomes: [
            {
              itemId: dust,
              chance: { numerator: dustChance, denominator: 100 },
              quantity: rangeQuantity(dustMin, dustMax),
            },
            {
              itemId: essence,
              chance: { numerator: 100 - dustChance - shardChance, denominator: 100 },
              quantity: rangeQuantity(essenceMin, essenceMax),
            },
            ...(shard === 0
              ? []
              : [
                  {
                    itemId: shard,
                    chance: { numerator: shardChance, denominator: 100 },
                    quantity: rangeQuantity(1, 1),
                  },
                ]),
          ],
        }
      })
    },
  ),
  ...(
    [
      [1, 25, 10978],
      [26, 30, 11084],
      [31, 35, 11138],
      [36, 40, 11139],
      [41, 45, 11177],
      [46, 50, 11178],
      [51, 55, 14343],
    ] as const
  ).map(([min, max, itemId]): DisenchantRule => ({
    id: `classic-rare-equipment-${String(min)}-${String(max)}`,
    qualityId: 3,
    itemLevel: { min, max },
    equipment,
    evidenceIds,
    outcomes: [
      { itemId, chance: { numerator: 1, denominator: 1 }, quantity: rangeQuantity(1, 1) },
    ],
  })),
  ...(
    [
      [40, 45, 11177],
      [46, 50, 11178],
      [51, 55, 14343],
      [56, 60, 20725],
    ] as const
  ).map(([min, max, itemId]): DisenchantRule => ({
    id: `classic-epic-equipment-${String(min)}-${String(max)}`,
    qualityId: 4,
    itemLevel: { min, max },
    equipment,
    evidenceIds,
    outcomes: [
      {
        itemId,
        chance: { numerator: 1, denominator: 1 },
        quantity: rangeQuantity(min === 56 ? 1 : 2, min === 56 ? 1 : 4),
      },
    ],
  })),
]

export function classicHighLevelDisenchantRules(
  version: 'classic' | 'tbc',
): DisenchantRule[] {
  const max = version === 'classic' ? 92 : 88
  return [
    {
      id: `classic-rare-equipment-56-${version === 'classic' ? '74' : '65'}`,
      qualityId: 3,
      itemLevel: { min: 56, max: version === 'classic' ? 74 : 65 },
      equipment,
      evidenceIds,
      outcomes: [
        {
          itemId: 14344,
          chance: { numerator: 199, denominator: 200 },
          quantity: rangeQuantity(1, 1),
        },
        {
          itemId: 20725,
          chance: { numerator: 1, denominator: 200 },
          quantity: rangeQuantity(1, 1),
        },
      ],
    },
    ...(
      [
        [61, 75, equipment, false],
        [76, 80, disenchantArmor, false],
        [76, 80, disenchantWeapons, true],
        [81, max, equipment, false],
      ] as const
    ).map(([min, upper, groups, weighted], index): DisenchantRule => ({
      id: `classic-epic-nexus-${String(index)}`,
      qualityId: 4,
      itemLevel: { min, max: upper },
      equipment: [...groups],
      evidenceIds,
      outcomes: [
        {
          itemId: 20725,
          chance: { numerator: 1, denominator: 1 },
          quantity: weighted
            ? {
                kind: 'weighted-model',
                weights: [
                  { quantity: 1, weight: 33 },
                  { quantity: 2, weight: 67 },
                ],
              }
            : rangeQuantity(1, 2),
        },
      ],
    })),
  ]
}

export const CLASSIC_DISENCHANT_EVIDENCE = {
  id: 'classic-reference-model',
  kind: 'reference-model',
  url: 'https://warcraft.wiki.gg/wiki/Disenchanting_tables',
  checkedAt: '2026-10-17',
  itemIds: [13856, 19900, 19364],
  note: 'Справочная модель Classic; сверка нижних диапазонов с aux-addon/core/disenchant.lua и aux-addon-TBC/core/disenchant.lua. В TBC синие ilvl 66+ и эпики ilvl 90+ имеют другие материалы; см. docs/disenchanting.md. Равномерность диапазонов требует явного допущения, веса 33/67 модельные.',
} as const

export const CLASSIC_DISENCHANT_RULES = parseDisenchantRuleSet({
  schemaVersion: 1,
  gameVersion: 'classic',
  build: exclusions.build,
  revision: '2026-10-17.1',
  rules: [
    ...CLASSIC_COMMON_DISENCHANT_RULES,
    ...classicHighLevelDisenchantRules('classic'),
  ],
  overrides: exclusions.entries.map(({ itemId, flags }) => ({
    kind: 'deny',
    itemId,
    flags,
    evidenceIds: ['no-disenchant-csv'],
  })),
  evidence: [
    CLASSIC_DISENCHANT_EVIDENCE,
    {
      id: 'no-disenchant-csv',
      kind: 'exclusion-source',
      url: `https://wago.tools/db2/ItemSparse/csv?build=${exclusions.build}&locale=enUS`,
      checkedAt: '2026-10-17',
      itemIds: exclusions.entries.map(({ itemId }) => itemId),
      note: `${exclusions.fileName}; SHA-256 ${exclusions.sha256}; ${exclusions.field} & ${String(exclusions.mask)}. ${exclusions.coverage}`,
    },
  ],
})
