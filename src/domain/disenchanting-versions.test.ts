/// <reference types="node" />
import { readFileSync } from 'node:fs'

import { calculateDisenchant, selectDisenchantRule } from './disenchanting'
import type { DisenchantItem } from './disenchanting'
import { CLASSIC_DISENCHANT_RULES } from './disenchanting-classic'
import { TBC_DISENCHANT_RULES } from './disenchanting-tbc'
import { parseDisenchantRuleSet } from './disenchanting.schema'
import { GAME_VERSION_REGISTRY } from './game-version'
import type { GameVersion } from './game-version'
import { parseReferenceDatabase } from './reference-database.schema'
import { referenceItemToImport } from './reference-database-import'

function equipment(qualityId: number, itemLevel: number, weapon = false): DisenchantItem {
  return {
    source: { wowheadItemId: 13856 },
    qualityId,
    itemLevel,
    classId: weapon ? 2 : 4,
    subclassId: 1,
    inventoryType: weapon ? 17 : 8,
  }
}

function estimate(item: DisenchantItem, version: GameVersion) {
  return calculateDisenchant(item, version, new Map(), { acceptUniformQuantities: true })
}

describe('распыление Classic и общие диапазоны TBC', () => {
  it('сравнивает все общие предметы экипировки в поставляемых базах, сохраняя метаданные каждой версии', () => {
    const database = (version: 'classic' | 'tbc') => {
      const value: unknown = JSON.parse(
        readFileSync(`public/${GAME_VERSION_REGISTRY[version].databasePath}`, 'utf8'),
      )
      return parseReferenceDatabase(value, version)
    }
    const classic = database('classic')
    const tbc = database('tbc')
    const differences: number[] = []
    let compared = 0
    for (const [id, item] of Object.entries(classic.items)) {
      const other = tbc.items[id]
      if (!other || ![2, 4].includes(item.classId) || ![2, 3, 4].includes(item.qualityId))
        continue
      compared++
      const classicResult = estimate(
        { ...item, source: { wowheadItemId: Number(id) } },
        'classic',
      )
      const tbcResult = estimate(
        { ...other, source: { wowheadItemId: Number(id) } },
        'tbc',
      )
      expect(tbcResult.status, id).toBe(classicResult.status)
      if (JSON.stringify(classicResult.materials) !== JSON.stringify(tbcResult.materials))
        differences.push(Number(id))
    }
    expect(compared).toBe(585)
    // Stormshroud Gloves have ilvl 62 in Era and 55 in TBC. The others are rare ilvl 68/70.
    expect(differences).toEqual([
      21278, 22195, 22197, 22660, 22756, 22757, 22758, 22759, 22760, 22761, 22762, 22763,
      22764,
    ])
  })

  it.each([
    [1, 15, 10940, 1, 2, 10938, 1, 2, null],
    [16, 20, 10940, 2, 3, 10939, 1, 2, 10978],
    [21, 25, 10940, 4, 6, 10998, 1, 2, 10978],
    [26, 30, 11083, 1, 2, 11082, 1, 2, 11084],
    [31, 35, 11083, 2, 5, 11134, 1, 2, 11138],
    [36, 40, 11137, 1, 2, 11135, 1, 2, 11139],
    [41, 45, 11137, 2, 5, 11174, 1, 2, 11177],
    [46, 50, 11176, 1, 2, 11175, 1, 2, 11178],
    [51, 55, 11176, 2, 5, 16202, 1, 2, 14343],
    [56, 60, 16204, 1, 2, 16203, 1, 2, 14344],
    [61, 65, 16204, 2, 5, 16203, 2, 3, 14344],
  ] as const)(
    'зелёные границы %i–%i',
    (min, max, dust, dustMin, dustMax, essence, essenceMin, essenceMax, shard) => {
      for (const itemLevel of [min, max]) {
        for (const weapon of [false, true]) {
          const item = equipment(2, itemLevel, weapon)
          const result = estimate(item, 'classic')
          expect(result.status).toBe('supported')
          expect(result.materials.map(({ itemId }) => itemId)).toEqual([
            dust,
            essence,
            ...(shard === null ? [] : [shard]),
          ])
          expect(
            result.materials.slice(0, 2).map(({ rangeOnDrop }) => rangeOnDrop),
          ).toEqual([
            { min: dustMin, max: dustMax },
            { min: essenceMin, max: essenceMax },
          ])
          expect(estimate(item, 'tbc').materials).toEqual(result.materials)
          const chance = (index: number) => {
            const row = result.materials[index]
            if (!row) throw new Error('Нет материала')
            return row.chance.numerator / row.chance.denominator
          }
          expect(chance(0)).toBe(
            weapon
              ? min === 1
                ? 0.2
                : min === 21
                  ? 0.15
                  : min >= 51
                    ? 0.22
                    : 0.2
              : min === 1
                ? 0.8
                : 0.75,
          )
          expect(
            result.materials.reduce(
              (sum, row) => sum + row.chance.numerator / row.chance.denominator,
              0,
            ),
          ).toBeCloseTo(1)
        }
      }
    },
  )

  it.each([
    [1, 25, 10978],
    [26, 30, 11084],
    [31, 35, 11138],
    [36, 40, 11139],
    [41, 45, 11177],
    [46, 50, 11178],
    [51, 55, 14343],
    [56, 74, 14344],
  ])('синие границы Classic %i–%i', (min, max, shard) => {
    for (const ilvl of [min, max]) {
      const result = estimate(equipment(3, ilvl), 'classic')
      expect(result.status).toBe('supported')
      expect(result.materials[0]?.itemId).toBe(shard)
      expect(result.materials[0]?.rangeOnDrop).toEqual({ min: 1, max: 1 })
    }
  })

  it('сохраняет различия старых синих предметов ilvl 66+ между Classic и TBC', () => {
    const item = { ...equipment(3, 68, true), source: { wowheadItemId: 19900 } }
    expect(estimate(item, 'classic').materials.map(({ itemId }) => itemId)).toEqual([
      14344, 20725,
    ])
    expect(estimate(item, 'tbc').materials.map(({ itemId }) => itemId)).toEqual([
      22448, 20725,
    ])
  })

  it.each([
    [40, 45, 11177, 2, 4],
    [46, 50, 11178, 2, 4],
    [51, 55, 14343, 2, 4],
    [56, 60, 20725, 1, 1],
    [61, 75, 20725, 1, 2],
    [81, 92, 20725, 1, 2],
  ])(
    'эпические границы Classic %i–%i',
    (min, max, materialId, quantityMin, quantityMax) => {
      for (const itemLevel of [min, max]) {
        const result = estimate(equipment(4, itemLevel), 'classic')
        expect(result.status).toBe('supported')
        expect(result.materials[0]?.itemId).toBe(materialId)
        expect(result.materials[0]?.rangeOnDrop).toEqual({
          min: quantityMin,
          max: quantityMax,
        })
      }
    },
  )

  it.each(['classic', 'tbc'] as const)(
    'использует веса 33/67 для оружия ilvl 76–80 в %s',
    (version) => {
      for (const itemLevel of [76, 80]) {
        const result = calculateDisenchant(
          equipment(4, itemLevel, true),
          version,
          new Map([[20725, 100]]),
        )
        expect(result.materials[0]?.expectedQuantity).toBe(1.67)
        expect(result.expectedValueCopper).toBe(167)
        expect(result.assumptions).toEqual([])
        expect(
          estimate(equipment(4, itemLevel), version).materials[0]?.expectedQuantity,
        ).toBe(1.5)
      }
    },
  )

  it.each([90, 100, 105, 164])(
    'добавляет эпики TBC ilvl %i с правильной моделью количества',
    (itemLevel) => {
      const result = calculateDisenchant(
        equipment(4, itemLevel),
        'tbc',
        new Map([[22450, 100]]),
        { quantity: 3, acceptUniformQuantities: true },
      )
      expect(result.materials[0]?.itemId).toBe(22450)
      expect(result.materials[0]?.rangeOnDrop).toEqual({ min: 1, max: 2 })
      expect(result.expectedValueCopper).toBe(itemLevel >= 105 ? 501 : 450)
      expect(result.assumptions).toEqual(itemLevel >= 105 ? [] : ['uniform-quantities'])
    },
  )

  it('не переносит верхние эпические диапазоны и запреты между версиями', () => {
    expect(estimate(equipment(4, 90), 'classic').materials[0]?.itemId).toBe(20725)
    expect(estimate(equipment(4, 90), 'tbc').materials[0]?.itemId).toBe(22450)
    for (const version of ['classic', 'tbc'] as const)
      expect(
        selectDisenchantRule({ source: { wowheadItemId: 11287 } }, version).status,
      ).toBe('not-disenchantable')
    expect(selectDisenchantRule({ source: { wowheadItemId: 21766 } }, 'tbc').status).toBe(
      'not-disenchantable',
    )
    expect(
      selectDisenchantRule({ source: { wowheadItemId: 21766 } }, 'classic').status,
    ).toBe('missing-metadata')
  })

  it.each([
    ['classic', 2, 0],
    ['classic', 2, 66],
    ['classic', 3, 75],
    ['classic', 4, 39],
    ['classic', 4, 93],
    ['tbc', 2, 78],
    ['tbc', 2, 121],
    ['tbc', 3, 116],
    ['tbc', 4, 89],
    ['tbc', 4, 101],
    ['tbc', 4, 104],
    ['tbc', 4, 165],
  ] as const)(
    'не экстраполирует %s качество %i ilvl %i',
    (version, qualityId, itemLevel) => {
      expect(estimate(equipment(qualityId, itemLevel), version).status).toBe(
        'unsupported-rule',
      )
    },
  )

  it('не включает непроверенную Forever и не принимает набор/источник чужой версии', () => {
    expect(estimate(equipment(2, 20), 'forever').status).toBe('unsupported-version')
    expect(
      selectDisenchantRule(equipment(2, 20), 'classic', TBC_DISENCHANT_RULES).status,
    ).toBe('unsupported-version')
    expect(
      selectDisenchantRule(
        { ...equipment(2, 20), source: { wowheadItemId: 13856, wowheadVersion: 'tbc' } },
        'classic',
      ).status,
    ).toBe('unsupported-version')
    expect(() =>
      parseDisenchantRuleSet({
        ...CLASSIC_DISENCHANT_RULES,
        build: TBC_DISENCHANT_RULES.build,
      }),
    ).toThrow()
  })

  it.each(['classic', 'tbc'] as const)(
    'рассчитывает реальные импорты старого мира в %s',
    (version) => {
      const definition = GAME_VERSION_REGISTRY[version]
      const value: unknown = JSON.parse(
        readFileSync(`public/${definition.databasePath}`, 'utf8'),
      )
      const db = parseReferenceDatabase(value, version)
      for (const wowheadItemId of [13856, 12640, 19166]) {
        const reference = db.items[String(wowheadItemId)]
        if (!reference) throw new Error('Нет предмета в базе')
        const imported = referenceItemToImport(reference, version)
        expect(
          selectDisenchantRule(
            { ...imported, source: { wowheadItemId, wowheadVersion: version } },
            version,
          ).status,
        ).toBe('supported')
      }
    },
  )
})
