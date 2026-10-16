import exclusions from './disenchanting-tbc-exclusions.json'
import {
  disenchantArmor as armor,
  disenchantWeapons as weapons,
} from './disenchanting-equipment'
import {
  CLASSIC_COMMON_DISENCHANT_RULES,
  CLASSIC_DISENCHANT_EVIDENCE,
  classicHighLevelDisenchantRules,
} from './disenchanting-classic'
import { parseDisenchantRuleSet } from './disenchanting.schema'
import type { DisenchantRule, DisenchantRuleSet } from './disenchanting.schema'

const greenRules: DisenchantRule[] = [
  {
    min: 79,
    max: 79,
    dustMin: 1,
    dustMax: 2,
    essenceId: 22447,
    essenceMin: 1,
    essenceMax: 2,
    shardId: 22448,
  },
  {
    min: 80,
    max: 99,
    dustMin: 2,
    dustMax: 3,
    essenceId: 22447,
    essenceMin: 2,
    essenceMax: 3,
    shardId: 22448,
  },
  {
    min: 100,
    max: 120,
    dustMin: 2,
    dustMax: 5,
    essenceId: 22446,
    essenceMin: 1,
    essenceMax: 2,
    shardId: 22449,
  },
].flatMap((band) =>
  [false, true].map((weapon): DisenchantRule => ({
    id: `tbc-uncommon-${weapon ? 'weapon' : 'armor'}-${String(band.min)}-${String(band.max)}`,
    qualityId: 2,
    itemLevel: { min: band.min, max: band.max },
    equipment: weapon ? weapons : armor,
    evidenceIds: ['reference-model', 'green-observations'],
    outcomes: [
      {
        itemId: 22445,
        chance: { numerator: weapon ? 22 : 75, denominator: 100 },
        quantity: {
          kind: 'uniform-model',
          range: { min: band.dustMin, max: band.dustMax },
        },
      },
      {
        itemId: band.essenceId,
        chance: { numerator: weapon ? 75 : 22, denominator: 100 },
        quantity: {
          kind: 'uniform-model',
          range: { min: band.essenceMin, max: band.essenceMax },
        },
      },
      {
        itemId: band.shardId,
        chance: { numerator: 3, denominator: 100 },
        quantity: { kind: 'fixed', quantity: 1 },
      },
    ],
  })),
)

// These are observations, not frequencies used to fit the reference probabilities.
const observations = [
  [21853, 22445, 728, 959, 2, 5],
  [21853, 22446, 198, 959, 1, 2],
  [21853, 22449, 33, 959, 1, 1],
  [25293, 22445, 382, 1851, 2, 5],
  [25293, 22446, 1420, 1851, 1, 2],
  [25293, 22449, 49, 1851, 1, 1],
  [25079, 22445, 266, 354, 2, 5],
  [25079, 22446, 75, 354, 1, 2],
  [25079, 22449, 13, 325, 1, 1],
  [23517, 22449, 351, 353, 1, 1],
  [23517, 22450, 2, 312, 1, 1],
  [21860, 22449, 123, 126, 1, 1],
  [21860, 22450, 3, 111, 1, 1],
  [25775, 22449, 78, 78, 1, 1],
] as const

export const TBC_DISENCHANT_RULES: DisenchantRuleSet = parseDisenchantRuleSet({
  schemaVersion: 1,
  gameVersion: 'tbc',
  build: '2.5.6.69795',
  revision: '2026-10-17.1',
  rules: [
    ...CLASSIC_COMMON_DISENCHANT_RULES,
    ...classicHighLevelDisenchantRules('tbc'),
    ...greenRules,
    {
      id: 'tbc-rare-equipment-66-99',
      qualityId: 3,
      itemLevel: { min: 66, max: 99 },
      equipment: [...armor, ...weapons],
      evidenceIds: ['extended-reference-model'],
      outcomes: [
        {
          itemId: 22448,
          chance: { numerator: 199, denominator: 200 },
          quantity: { kind: 'fixed', quantity: 1 },
        },
        {
          itemId: 20725,
          chance: { numerator: 1, denominator: 200 },
          quantity: { kind: 'fixed', quantity: 1 },
        },
      ],
    },
    ...(
      [
        [90, 100, false],
        [105, 164, true],
      ] as const
    ).map(([min, max, weighted]): DisenchantRule => ({
      id: `tbc-epic-equipment-${String(min)}-${String(max)}`,
      qualityId: 4,
      itemLevel: { min, max },
      equipment: [...armor, ...weapons],
      evidenceIds: ['extended-reference-model'],
      outcomes: [
        {
          itemId: 22450,
          chance: { numerator: 1, denominator: 1 },
          quantity: weighted
            ? {
                kind: 'weighted-model',
                weights: [
                  { quantity: 1, weight: 33 },
                  { quantity: 2, weight: 67 },
                ],
              }
            : { kind: 'uniform-model', range: { min: 1, max: 2 } },
        },
      ],
    })),
    {
      id: 'tbc-rare-equipment-100-115',
      qualityId: 3,
      itemLevel: { min: 100, max: 115 },
      equipment: [...armor, ...weapons],
      evidenceIds: ['reference-model', 'rare-observations'],
      outcomes: [
        {
          itemId: 22449,
          chance: { numerator: 199, denominator: 200 },
          quantity: { kind: 'fixed', quantity: 1 },
        },
        {
          itemId: 22450,
          chance: { numerator: 1, denominator: 200 },
          quantity: { kind: 'fixed', quantity: 1 },
        },
      ],
    },
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
      id: 'extended-reference-model',
      kind: 'reference-model',
      url: 'https://warcraft.wiki.gg/wiki/Disenchanting_tables',
      checkedAt: '2026-10-17',
      itemIds: [19900, 21863, 21848],
      note: 'Расширение справочной модели: синие ilvl 66–99, эпики 90–100 и 105–164. Для 105–164 модельные веса количества Void Crystal 33/67; равномерность 90–100 требует явного допущения. Неподтверждённые границы 89 и 101–104 не заполняются; см. docs/disenchanting.md.',
    },
    {
      id: 'reference-model',
      kind: 'reference-model',
      url: 'https://warcraft.wiki.gg/wiki/Disenchanting_tables',
      checkedAt: '2026-10-16',
      itemIds: [],
      note: 'Справочная модель из docs/disenchanting.md. Равномерность количеств — допущение; вероятности не доказаны частотами Wowhead.',
    },
    ...(['green', 'rare'] as const).map((group) => ({
      id: `${group}-observations`,
      kind: 'observation',
      url: `https://www.wowhead.com/tbc/item=${group === 'green' ? '21853' : '23517'}#disenchanting`,
      checkedAt: '2026-10-16',
      itemIds:
        group === 'green'
          ? [21853, 25293, 21849, 24076, 25559, 25610, 25079]
          : [23517, 21860, 25775],
      note: 'Перенесено из docs/disenchanting.md. URL каждого наблюдения: https://www.wowhead.com/tbc/item={itemId}#disenchanting. Знаменатели сохраняются по материалам; отсутствие наблюдения не означает нулевой шанс.',
      observations: observations
        .filter(
          ([itemId]) => [23517, 21860, 25775].includes(itemId) === (group === 'rare'),
        )
        .map(([itemId, materialItemId, count, total, min, max]) => ({
          itemId,
          materialItemId,
          count,
          total,
          range: { min, max },
        })),
    })),
    {
      id: 'no-disenchant-csv',
      kind: 'exclusion-source',
      url: `https://wago.tools/db2/ItemSparse/csv?build=${exclusions.build}&locale=enUS`,
      checkedAt: '2026-10-17',
      itemIds: exclusions.entries.map(({ itemId }) => itemId),
      note: `${exclusions.fileName}; SHA-256 ${exclusions.sha256}; ${exclusions.field} & ${String(exclusions.mask)}. ${exclusions.coverage} Значения flags сохранены по ID. Толкование бита: TrinityCore ItemTemplate.h (сторонняя реализация); для 21766 также комментарий Wowhead от 12.01.2008. Нулевой бит не доказывает возможность распыления.`,
    },
  ],
})
