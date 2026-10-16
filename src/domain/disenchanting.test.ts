/// <reference types="node" />
import { readFileSync } from 'node:fs'

import { referenceItemToImport } from './reference-database-import'
import { parseReferenceDatabase } from './reference-database.schema'
import {
  calculateDisenchant,
  calculateDisenchantComparison,
  selectDisenchantRule,
} from './disenchanting'
import type { DisenchantItem } from './disenchanting'
import { TBC_DISENCHANT_RULES } from './disenchanting-tbc'
import { parseDisenchantRuleSet } from './disenchanting.schema'
import type { DisenchantRuleSet } from './disenchanting.schema'
import type { DisenchantQuantity } from './disenchanting.schema'
import type { Item, ItemCatalog } from './item.types'
import { DEFAULT_TSM_SETTINGS } from './tsm'

const armor: DisenchantItem = {
  source: { wowheadItemId: 21853, wowheadVersion: 'tbc' },
  qualityId: 2,
  itemLevel: 108,
  classId: 4,
  subclassId: 1,
  inventoryType: 8,
}

function selected(item: DisenchantItem = armor, rules = TBC_DISENCHANT_RULES) {
  const selection = selectDisenchantRule(item, 'tbc', rules)
  if (selection.status !== 'supported')
    throw new Error(`Нет правила: ${selection.status}`)
  return selection
}

describe('выбор правил дизенчанта TBC', () => {
  it.each([78, 79, 80, 99, 100, 120, 121])('зелёная граница %i', (itemLevel) => {
    const result = selectDisenchantRule({ ...armor, itemLevel }, 'tbc')
    expect(result.status).toBe(
      itemLevel >= 79 && itemLevel <= 120 ? 'supported' : 'unsupported-rule',
    )
    if (result.status !== 'supported') return
    expect(result.rule.outcomes.map(({ itemId }) => itemId)).toEqual(
      itemLevel < 100 ? [22445, 22447, 22448] : [22445, 22446, 22449],
    )
    expect(result.rule.outcomes[0]?.quantity).toEqual({
      kind: 'uniform-model',
      range:
        itemLevel === 79
          ? { min: 1, max: 2 }
          : itemLevel < 100
            ? { min: 2, max: 3 }
            : { min: 2, max: 5 },
    })
  })

  it.each([99, 100, 115, 116])('синяя граница %i', (itemLevel) => {
    const result = selectDisenchantRule({ ...armor, qualityId: 3, itemLevel }, 'tbc')
    expect(result.status).toBe(
      itemLevel >= 100 && itemLevel <= 115 ? 'supported' : 'unsupported-rule',
    )
    if (result.status !== 'supported') return
    expect(result.rule.outcomes).toEqual([
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
    ])
  })

  it.each([
    [4, 0, 2, 75],
    [4, 0, 11, 75],
    [4, 0, 12, 75],
    [4, 6, 14, 75],
    [4, 0, 23, 75],
    [4, 1, 16, 75],
    [2, 19, 26, 22],
    [2, 7, 13, 22],
    [2, 10, 17, 22],
    [2, 2, 15, 22],
  ])(
    'класс %i / подкласс %i / слот %i',
    (classId, subclassId, inventoryType, numerator) => {
      expect(
        selected({ ...armor, classId, subclassId, inventoryType }).rule.outcomes[0]
          ?.chance.numerator,
      ).toBe(numerator)
    },
  )

  it.each([
    [2, 20, 17],
    [2, 16, 25],
    [4, 7, 28],
    [4, 8, 28],
    [4, 9, 28],
    [4, 10, 28],
    [4, 1, 4],
    [4, 6, 13],
    [7, 12, 0],
  ])(
    'не распространяет модель на специальные типы %i/%i/%i',
    (classId, subclassId, inventoryType) => {
      expect(
        selectDisenchantRule({ ...armor, classId, subclassId, inventoryType }, 'tbc')
          .status,
      ).toBe('unsupported-rule')
    },
  )

  it('не поддерживает эпики, старый мир и другую версию', () => {
    expect(selectDisenchantRule({ ...armor, qualityId: 4 }, 'tbc').status).toBe(
      'unsupported-rule',
    )
    expect(selectDisenchantRule({ ...armor, itemLevel: 60 }, 'tbc').status).toBe(
      'unsupported-rule',
    )
    for (const version of ['forever', 'classic'] as const) {
      expect(selectDisenchantRule(armor, version).status).toBe('unsupported-version')
      expect(
        selectDisenchantRule(
          { ...armor, source: { wowheadItemId: 21853, wowheadVersion: version } },
          'tbc',
        ).status,
      ).toBe('unsupported-version')
    }
  })

  it.each(['qualityId', 'itemLevel', 'classId', 'subclassId', 'inventoryType'] as const)(
    'различает неизвестное и неподдерживаемое поле %s',
    (field) => {
      for (const value of [undefined, null, -1, 1.5, NaN]) {
        expect(selectDisenchantRule({ ...armor, [field]: value }, 'tbc')).toEqual({
          status: 'missing-metadata',
          fields: [field],
        })
      }
    },
  )

  it('требует игровой ID для проверки исключений; версия источника может отсутствовать', () => {
    for (const wowheadItemId of [0, -1, NaN, 1.5]) {
      expect(
        selectDisenchantRule({ ...armor, source: { wowheadItemId } }, 'tbc').status,
      ).toBe('missing-metadata')
    }
    expect(selectDisenchantRule({ ...armor, source: undefined }, 'tbc').status).toBe(
      'missing-metadata',
    )
    expect(selected({ ...armor, source: { wowheadItemId: 21853 } }).basis).toBe(
      'reference-model',
    )
  })

  it.each([11287, 11288, 11289, 11290, 21766, 27637, 20241])(
    'запрет %i имеет приоритет над метаданными и диапазоном',
    (wowheadItemId) => {
      expect(selectDisenchantRule({ source: { wowheadItemId } }, 'tbc')).toEqual({
        status: 'not-disenchantable',
        evidenceIds: ['no-disenchant-csv'],
      })
    },
  )

  it('сверяет модель с реальным справочником и импортом, не используя requiredLevel', () => {
    const value: unknown = JSON.parse(
      readFileSync('public/data/tbc/craftcalc-db.2.5.6.69795.json', 'utf8'),
    )
    const db = parseReferenceDatabase(value, 'tbc')
    const candidates = Object.values(db.items).filter(
      (item) =>
        item.qualityId === 2 &&
        [2, 4].includes(item.classId) &&
        item.itemLevel >= 79 &&
        item.itemLevel <= 120,
    )
    expect(candidates).toHaveLength(46)
    expect(candidates.filter(({ itemLevel }) => itemLevel < 100)).toHaveLength(31)
    for (const id of [21853, 21849, 24076, 23517, 21860]) {
      const reference = db.items[String(id)]
      if (!reference) throw new Error('Нет эталона')
      const imported = referenceItemToImport(reference, 'tbc')
      const item = {
        ...imported,
        requiredLevel: 0,
        source: { wowheadItemId: imported.wowheadItemId },
      }
      expect(selectDisenchantRule(item, 'tbc').status).toBe('supported')
    }
    for (const id of [22445, 22446, 22447, 22448, 22449, 22450])
      expect(db.items[String(id)]).toBeDefined()
  })
})

describe('валидация набора правил', () => {
  function changedRule(change: (rule: DisenchantRuleSet['rules'][number]) => void) {
    const set = structuredClone(TBC_DISENCHANT_RULES)
    const rule = set.rules[0]
    if (!rule) throw new Error('Нет правила')
    change(rule)
    return set
  }

  it('принимает статический набор и сохраняет разные знаменатели наблюдений', () => {
    expect(parseDisenchantRuleSet(TBC_DISENCHANT_RULES).rules).toHaveLength(7)
    const shield = TBC_DISENCHANT_RULES.evidence
      .flatMap(({ observations }) => observations)
      .filter(({ itemId }) => itemId === 25079)
    expect(shield.map(({ total }) => total)).toEqual([354, 354, 325])
  })

  it.each([-1, 0, 76, 101])('отклоняет неправильную вероятность %i', (numerator) => {
    const set = changedRule((rule) => {
      if (rule.outcomes[0]) rule.outcomes[0].chance.numerator = numerator
    })
    expect(() => parseDisenchantRuleSet(set)).toThrow()
  })

  it('отклоняет неоднозначность также при выборе, дубли ID и повреждённые ссылки', () => {
    const rule = TBC_DISENCHANT_RULES.rules[0]
    if (!rule) throw new Error('Нет правила')
    const overlapping = {
      ...TBC_DISENCHANT_RULES,
      rules: [...TBC_DISENCHANT_RULES.rules, { ...rule, id: 'overlap' }],
    }
    expect(() => parseDisenchantRuleSet(overlapping)).toThrow()
    expect(() => selectDisenchantRule(armor, 'tbc', overlapping)).toThrow()
    expect(() =>
      parseDisenchantRuleSet({
        ...TBC_DISENCHANT_RULES,
        rules: [...TBC_DISENCHANT_RULES.rules, rule],
      }),
    ).toThrow()
    expect(() =>
      parseDisenchantRuleSet(
        changedRule((r) => {
          r.evidenceIds = ['absent']
        }),
      ),
    ).toThrow()
    expect(() =>
      parseDisenchantRuleSet({
        ...TBC_DISENCHANT_RULES,
        overrides: [
          { kind: 'rule', itemId: 1, ruleId: 'absent', evidenceIds: ['reference-model'] },
        ],
      }),
    ).toThrow()
  })

  it('применяет отдельное правило результата по ID', () => {
    const rules = {
      ...TBC_DISENCHANT_RULES,
      overrides: [
        ...TBC_DISENCHANT_RULES.overrides,
        {
          kind: 'rule' as const,
          itemId: 21853,
          ruleId: 'tbc-rare-equipment-100-115',
          evidenceIds: ['reference-model'],
        },
      ],
    }
    expect(selected(armor, rules).rule.qualityId).toBe(3)
  })
})

const prices = new Map([22445, 22446, 22447, 22448, 22449, 22450].map((id) => [id, 100]))

function withDistribution(quantity: DisenchantQuantity): DisenchantRuleSet {
  return {
    ...TBC_DISENCHANT_RULES,
    rules: [
      {
        ...selected().rule,
        outcomes: [{ itemId: 22445, chance: { numerator: 1, denominator: 1 }, quantity }],
      },
    ],
  }
}

describe('ожидаемый выход и стоимость дизенчанта', () => {
  it.each([
    [79, 4, 1, 8, [1.125, 0.33, 0.03]],
    [80, 4, 1, 8, [1.875, 0.55, 0.03]],
    [99, 4, 0, 11, [1.875, 0.55, 0.03]],
    [100, 4, 6, 14, [2.625, 0.33, 0.03]],
    [120, 4, 1, 8, [2.625, 0.33, 0.03]],
    [114, 2, 19, 26, [0.77, 1.125, 0.03]],
  ] as const)(
    'модель ilvl %i, класс %i/%i/%i',
    (itemLevel, classId, subclassId, inventoryType, expected) => {
      const result = calculateDisenchant(
        { ...armor, itemLevel, classId, subclassId, inventoryType },
        'tbc',
        prices,
        { acceptUniformQuantities: true },
      )
      for (const [index, value] of expected.entries())
        expect(result.materials[index]?.expectedQuantity).toBeCloseTo(value)
      expect(result.assumptions).toEqual(['uniform-quantities'])
    },
  )

  it('не принимает равномерность неявно; диапазон и фиксированный исход сохраняются', () => {
    const result = calculateDisenchant(armor, 'tbc', prices)
    expect(result.materials.map(({ rangeOnDrop }) => rangeOnDrop)).toEqual([
      { min: 2, max: 5 },
      { min: 1, max: 2 },
      { min: 1, max: 1 },
    ])
    expect(result.materials.map(({ expectedQuantity }) => expectedQuantity)).toEqual([
      null,
      null,
      0.03,
    ])
    expect(result.expectedValueCopper).toBeNull()
    expect(result.exactExpectedValueCopper).toBeNull()
    expect(result.knownValueCopper).toBe(3)
    expect(result.unknownQuantityItemIds).toEqual([22445, 22446])
    expect(result.assumptions).toEqual([])
  })

  it('считает фиксированный синий выход без допущения о количестве', () => {
    const result = calculateDisenchant(
      { ...armor, qualityId: 3 },
      'tbc',
      new Map([
        [22449, 100],
        [22450, 1],
      ]),
      { quantity: 3 },
    )
    expect(result.materials[0]?.expectedQuantity).toBeCloseTo(2.985)
    expect(result.materials[1]?.expectedQuantity).toBeCloseTo(0.015)
    expect(result.exactExpectedValueCopper).toBeCloseTo(298.515)
    expect(result.expectedValueCopper).toBe(299)
    expect(result.assumptions).toEqual([])
  })

  it('нормализует условные веса, сохраняя модельный статус', () => {
    const rules = withDistribution({
      kind: 'weighted-model',
      weights: [
        { quantity: 1, weight: 1 },
        { quantity: 2, weight: 3 },
      ],
    })
    const result = calculateDisenchant(armor, 'tbc', prices, { quantity: 2 }, rules)
    expect(result.materials[0]?.expectedQuantity).toBe(3.5)
    expect(result.materials[0]?.rangeOnDrop).toEqual({ min: 1, max: 2 })
    expect(result.materials[0]?.quantity.kind).toBe('weighted-model')
    expect(result.expectedValueCopper).toBe(350)
  })

  it('не подменяет неизвестное распределение средним даже при принятии равномерности', () => {
    const rules = withDistribution({ kind: 'unknown', range: { min: 1, max: 2 } })
    const result = calculateDisenchant(
      armor,
      'tbc',
      prices,
      { acceptUniformQuantities: true },
      rules,
    )
    expect(result.materials[0]?.expectedQuantity).toBeNull()
    expect(result.materials[0]?.rangeOnDrop).toEqual({ min: 1, max: 2 })
    expect(result.expectedValueCopper).toBeNull()
    expect(result.assumptions).toEqual([])
  })

  it.each([undefined, null])(
    'неизвестная цена %s исключает полный итог, сохраняя известную часть',
    (price) => {
      const salePrices = new Map<number, number | null>([[22449, 100]])
      if (price !== undefined) salePrices.set(22450, price)
      const result = calculateDisenchant({ ...armor, qualityId: 3 }, 'tbc', salePrices)
      expect(result.expectedValueCopper).toBeNull()
      expect(result.knownValueCopper).toBe(100)
      expect(result.missingPriceItemIds).toEqual([22450])
      expect(result.unknownQuantityItemIds).toEqual([])
    },
  )

  it('различает известный ноль и отсутствие цены, в том числе у редкого исхода', () => {
    const result = calculateDisenchant(
      { ...armor, qualityId: 3 },
      'tbc',
      new Map([
        [22449, 0],
        [22450, 0],
      ]),
    )
    expect(result.expectedValueCopper).toBe(0)
    expect(result.missingPriceItemIds).toEqual([])
  })

  it('исход нулевой вероятности не требует цены и распределения', () => {
    const rules = withDistribution({ kind: 'fixed', quantity: 1 })
    const rule = rules.rules[0]
    if (!rule) throw new Error('Нет правила')
    rule.outcomes.push({
      itemId: 22450,
      chance: { numerator: 0, denominator: 1 },
      quantity: { kind: 'unknown', range: { min: 1, max: 2 } },
    })
    const result = calculateDisenchant(armor, 'tbc', new Map([[22445, 5]]), {}, rules)
    expect(result.expectedValueCopper).toBe(5)
    expect(result.missingPriceItemIds).toEqual([])
    expect(result.unknownQuantityItemIds).toEqual([])
  })

  it('масштабирует дробный выход и округляет только общую сумму', () => {
    const result = calculateDisenchant(
      armor,
      'tbc',
      new Map([...prices.keys()].map((id) => [id, 1])),
      { quantity: 100, acceptUniformQuantities: true },
    )
    expect(result.materials.map(({ expectedQuantity }) => expectedQuantity)).toEqual([
      262.5, 33, 3,
    ])
    expect(result.exactExpectedValueCopper).toBe(298.5)
    expect(result.expectedValueCopper).toBe(299)
  })

  it('округляет точные полмонеты вверх независимо от двоичной погрешности', () => {
    const result = calculateDisenchant(
      armor,
      'tbc',
      new Map([
        [22445, 0],
        [22446, 12],
        [22449, 18],
      ]),
      { quantity: 3, acceptUniformQuantities: true },
    )
    expect(result.exactExpectedValueCopper).toBe(13.5)
    expect(result.expectedValueCopper).toBe(14)
    expect(result.knownValueCopper).toBe(14)
  })

  it.each([
    [{ ...armor, qualityId: 4 }, 'tbc', 'unsupported-rule'],
    [{ ...armor, source: undefined }, 'tbc', 'missing-metadata'],
    [{ source: { wowheadItemId: 21766 } }, 'tbc', 'not-disenchantable'],
    [armor, 'classic', 'unsupported-version'],
  ] as const)('не превращает отказ %j в ноль', (item, version, status) => {
    const result = calculateDisenchant(item, version, prices)
    expect(result.status).toBe(status)
    expect(result.expectedValueCopper).toBeNull()
    expect(result.knownValueCopper).toBeNull()
    expect(result.materials).toEqual([])
  })

  it.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'отклоняет количество %s',
    (quantity) => {
      expect(() => calculateDisenchant(armor, 'tbc', prices, { quantity })).toThrow(
        RangeError,
      )
    },
  )

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'отклоняет цену %s',
    (price) => {
      expect(() => calculateDisenchant(armor, 'tbc', new Map([[22445, price]]))).toThrow(
        RangeError,
      )
    },
  )

  it('отклоняет переполнение итоговой суммы', () => {
    expect(() =>
      calculateDisenchant(armor, 'tbc', prices, {
        quantity: Number.MAX_SAFE_INTEGER,
        acceptUniformQuantities: true,
      }),
    ).toThrow(RangeError)
  })

  it.each([
    { kind: 'uniform-model', range: { min: 5, max: 2 } },
    { kind: 'weighted-model', weights: [{ quantity: 1, weight: 0 }] },
    {
      kind: 'weighted-model',
      weights: [
        { quantity: 1, weight: 1 },
        { quantity: 1, weight: 2 },
      ],
    },
    { kind: 'fixed', quantity: 0 },
  ])('отклоняет неверное распределение %j', (quantity) => {
    const rules = withDistribution({ kind: 'fixed', quantity: 1 })
    const rule = rules.rules[0]
    if (!rule) throw new Error('Нет правила')
    expect(() =>
      parseDisenchantRuleSet({
        ...rules,
        rules: [
          {
            ...rule,
            outcomes: [
              { itemId: 22445, chance: { numerator: 1, denominator: 1 }, quantity },
            ],
          },
        ],
      }),
    ).toThrow()
  })
})

describe('сравнения покупки и крафта с дизенчантом', () => {
  function catalog(): ItemCatalog {
    const defaults = {
      name: 'Предмет',
      iconUrl: '',
      sections: ['reagents'] as Item['sections'],
      purchasePriceCopper: null,
      salePriceCopper: null,
      recipe: null,
    }
    return {
      ore: { ...defaults, id: 'ore', purchasePriceCopper: 1 },
      boots: {
        ...defaults,
        ...armor,
        id: 'boots',
        qualityId: 3,
        purchasePriceCopper: 10,
        recipe: {
          outputQuantity: 3,
          profession: 'tailoring',
          reagents: [{ itemId: 'ore', quantity: 1, acquisition: 'buy' }],
        },
      },
    }
  }
  const salePrices = new Map([
    [22449, 1],
    [22450, 0],
  ])

  it('переиспользует точную себестоимость с выходом рецепта и округляет окончательную прибыль', () => {
    const result = calculateDisenchantComparison(catalog(), 'boots', 'tbc', salePrices, {
      quantity: 2,
    })
    expect(result.disenchant.exactExpectedValueCopper).toBeCloseTo(1.99)
    expect(result.buyProfitCopper).toBe(-18)
    expect(result.craftProfitCopper).toBe(1)
  })

  it('неизвестная цена покупки не мешает сравнению крафта', () => {
    const items = catalog()
    if (items.boots) items.boots.purchasePriceCopper = null
    const result = calculateDisenchantComparison(items, 'boots', 'tbc', salePrices, {
      quantity: 2,
    })
    expect(result.buyProfitCopper).toBeNull()
    expect(result.craftProfitCopper).toBe(1)
  })

  it('неизвестная себестоимость не мешает сравнению покупки', () => {
    const items = catalog()
    if (items.ore) items.ore.purchasePriceCopper = null
    const result = calculateDisenchantComparison(items, 'boots', 'tbc', salePrices, {
      quantity: 2,
    })
    expect(result.buyProfitCopper).toBe(-18)
    expect(result.craftProfitCopper).toBeNull()
  })

  it('передаёт текущий PriceContext существующим расчётам', () => {
    const items = catalog()
    if (items.ore) items.ore.purchasePriceSource = 'tsm'
    if (items.boots) items.boots.purchasePriceSource = 'tsm'
    const result = calculateDisenchantComparison(items, 'boots', 'tbc', salePrices, {
      prices: { version: 'tbc', settings: DEFAULT_TSM_SETTINGS, snapshot: null },
    })
    expect(result.buyProfitCopper).toBeNull()
    expect(result.craftProfitCopper).toBeNull()
  })

  it('сохраняет null для отсутствующего предмета, неизвестных материалов и неподдерживаемой версии', () => {
    for (const result of [
      calculateDisenchantComparison(catalog(), 'absent', 'tbc', salePrices),
      calculateDisenchantComparison(catalog(), 'boots', 'tbc', new Map()),
      calculateDisenchantComparison(catalog(), 'boots', 'forever', salePrices),
    ]) {
      expect(result.buyProfitCopper).toBeNull()
      expect(result.craftProfitCopper).toBeNull()
    }
  })
})
