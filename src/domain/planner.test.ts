import { calculateCraftPlan } from './planner'
import type { Item, ItemCatalog, RecipeLine } from './item.types'
import type { PlannerTarget } from './planner.types'
import { DEFAULT_TSM_SETTINGS, type PriceContext } from './tsm'

function item(id: string, reagents?: RecipeLine[], outputQuantity = 1): Item {
  return {
    id,
    name: id,
    iconUrl: '',
    sections: ['crafts'],
    purchasePriceCopper: 10,
    salePriceCopper: 100,
    recipe: reagents ? { outputQuantity, profession: 'tailoring', reagents } : null,
  }
}
const line = (
  itemId: string,
  quantity = 1,
  acquisition: RecipeLine['acquisition'] = 'craft',
): RecipeLine => ({ itemId, quantity, acquisition })
const catalog: ItemCatalog = {
  ore: item('ore'),
  bar: item('bar', [line('ore', 3, 'buy')], 2),
  a: item('a', [line('bar')]),
  b: item('b', [line('bar')]),
}
const targets: PlannerTarget[] = [
  { itemId: 'a', quantity: 1 },
  { itemId: 'b', quantity: 1 },
]

describe('расчёт плана', () => {
  it('объединяет общие промежуточные крафты до округления и не меняет вход', () => {
    const before = JSON.stringify({ catalog, targets })
    const result = calculateCraftPlan(catalog, targets)
    expect(result.errors).toEqual([])
    expect(result.purchases).toMatchObject([{ itemId: 'ore', quantity: 3, cost: 30 }])
    expect(result.steps[0]).toMatchObject({
      itemId: 'bar',
      craftCount: 1,
      producedQuantity: 2,
      surplusQuantity: 0,
    })
    expect(result).toMatchObject({ budget: 30, revenue: 200, profit: 170 })
    expect(JSON.stringify({ catalog, targets })).toBe(before)
  })
  it('добавляет самостоятельную цель промежуточного предмета и считает выручку только целей', () => {
    const result = calculateCraftPlan(catalog, [
      ...targets,
      { itemId: 'bar', quantity: 1 },
    ])
    expect(result.steps[0]).toMatchObject({
      itemId: 'bar',
      requiredQuantity: 3,
      craftCount: 2,
      surplusQuantity: 1,
    })
    expect(result).toMatchObject({ budget: 60, revenue: 300, profit: 240 })
  })
  it('округляет ручной некратный запрос, сохраняя сам запрос', () => {
    const result = calculateCraftPlan(
      { ...catalog, bar: item('bar', [line('ore', 2, 'buy')], 3) },
      [{ itemId: 'bar', quantity: 4 }],
    )
    expect(result.targets[0]?.quantity).toBe(4)
    expect(result.steps[0]).toMatchObject({
      craftCount: 2,
      producedQuantity: 6,
      surplusQuantity: 2,
    })
    expect(result.budget).toBe(40)
  })
  it('сохраняет явную покупку независимо от излишка крафта', () => {
    const result = calculateCraftPlan(
      { ...catalog, b: item('b', [line('bar', 1, 'buy')]) },
      targets,
    )
    expect(result.purchases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ itemId: 'bar', quantity: 1 }),
        expect.objectContaining({ itemId: 'ore', quantity: 3 }),
      ]),
    )
    expect(result.steps.find((step) => step.itemId === 'bar')?.surplusQuantity).toBe(1)
  })
  it('объединяет покупку реагента и прямую цель с отдельными подытогами', () => {
    const result = calculateCraftPlan(catalog, [
      ...targets,
      { itemId: 'ore', quantity: 2 },
    ])
    expect(result.purchases[0]).toMatchObject({
      quantity: 5,
      productionQuantity: 3,
      additionalQuantity: 2,
    })
    expect(result).toMatchObject({
      productionBudget: 30,
      additionalBudget: 20,
      budget: 50,
      profit: 170,
    })
    expect(calculateCraftPlan(catalog, [{ itemId: 'ore', quantity: 2 }])).toMatchObject({
      revenue: null,
      profit: null,
      steps: [],
      budget: 20,
    })
  })
  it.each([null, 0])('различает неизвестную и нулевую цену %s', (price) => {
    const result = calculateCraftPlan(
      { ...catalog, ore: { ...item('ore'), purchasePriceCopper: price } },
      targets,
    )
    expect(result.budget).toBe(price === null ? null : 0)
    expect(result.missingPrices).toBe(price === null ? 1 : 0)
    expect(result.purchases[0]?.quantity).toBe(3)
  })
  it('не выдаёт частичную сумму за полный бюджет и прибыль', () => {
    const result = calculateCraftPlan(
      { ...catalog, extra: { ...item('extra'), purchasePriceCopper: null } },
      [...targets, { itemId: 'extra', quantity: 2 }],
    )
    expect(result).toMatchObject({
      budget: null,
      knownBudget: 30,
      productionBudget: 30,
      additionalBudget: null,
      profit: 170,
    })
    expect(
      calculateCraftPlan(
        { ...catalog, a: { ...item('a', [line('bar')]), salePriceCopper: null } },
        targets,
      ).profit,
    ).toBeNull()
  })
  it('переиспользует auto: профессии, равные цены и ручной выбор', () => {
    const data: ItemCatalog = { ...catalog, a: item('a', [line('bar', 1, 'auto')]) }
    const target = [{ itemId: 'a', quantity: 1 }]
    expect(calculateCraftPlan(data, target).purchases[0]?.itemId).toBe('bar')
    expect(
      calculateCraftPlan(data, target, new Set(['tailoring'])).purchases[0]?.itemId,
    ).toBe('bar')
    data.bar = { ...item('bar', [line('ore', 3, 'buy')], 2), purchasePriceCopper: 16 }
    expect(
      calculateCraftPlan(data, target, new Set(['tailoring'])).purchases[0]?.itemId,
    ).toBe('ore')
    data.bar.purchasePriceCopper = 15
    expect(
      calculateCraftPlan(data, target, new Set(['tailoring'])).purchases[0]?.itemId,
    ).toBe('bar')
  })
  it('подставляет ручные цены без снимка TSM и сохраняет расчёты вложенных партий', () => {
    const prices: PriceContext = {
      version: 'tbc',
      settings: { ...DEFAULT_TSM_SETTINGS, priceMode: 'tsm' },
      snapshot: null,
    }
    expect(calculateCraftPlan(catalog, targets, new Set(), prices)).toMatchObject({
      budget: 30,
      revenue: 200,
      profit: 170,
    })
    expect(
      calculateCraftPlan(catalog, targets, new Set(), prices).purchases[0]?.priceSource,
    ).toBe('manual')
  })
  it('подставляет TSM в закупку и выручку, сохраняя неизвестные цены без обоих источников', () => {
    const market = { region: 'eu', realm: 'thunderstrike', faction: 'alliance' } as const
    const prices: PriceContext = {
      version: 'tbc',
      settings: { ...DEFAULT_TSM_SETTINGS, market },
      snapshot: {
        schemaVersion: 1,
        market,
        scannedAt: '2026-01-01T00:00:00Z',
        items: {
          '1': { recent: 4, marketValue: null },
          '2': { recent: 90, marketValue: null },
        },
      },
    }
    const data = {
      ...catalog,
      ore: { ...item('ore'), source: { wowheadItemId: 1 }, purchasePriceCopper: null },
      a: {
        ...item('a', [line('bar')]),
        source: { wowheadItemId: 2 },
        salePriceCopper: null,
      },
    }
    const result = calculateCraftPlan(data, targets, new Set(), prices)
    expect(result).toMatchObject({
      budget: 12,
      revenue: 190,
      profit: 178,
      missingPrices: 0,
    })
    expect(result.purchases[0]).toMatchObject({ unitPrice: 4, priceSource: 'tsm' })
    expect(
      calculateCraftPlan(data, targets, new Set(), { ...prices, snapshot: null }),
    ).toMatchObject({ budget: null, revenue: null, profit: null, missingPrices: 1 })
  })
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'отклоняет неверный запрос %s',
    (quantity) => {
      expect(calculateCraftPlan(catalog, [{ itemId: 'a', quantity }]).errors).not.toEqual(
        [],
      )
    },
  )
  it('диагностирует отсутствующие цели, циклы, пустые рецепты и переполнение', () => {
    const broken: ItemCatalog[] = [
      {},
      { ...catalog, ore: item('ore', [line('a')]) },
      { ...catalog, a: item('a', []) },
      { ...catalog, a: item('a', [line('ore', Number.MAX_SAFE_INTEGER, 'buy')]) },
      { ...catalog, a: item('a', [line('ore', 1.5, 'buy')]) },
      { ...catalog, a: item('a', [line('ore')], 0) },
      { ...catalog, a: item('a', [line('ore')]) },
    ]
    for (const data of broken) {
      const result = calculateCraftPlan(data, [{ itemId: 'a', quantity: 2 }])
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.budget).toBeNull()
      expect(result.purchases).toEqual([])
    }
  })
  it('возвращает пустой план без ошибок', () => {
    expect(calculateCraftPlan({}, [])).toMatchObject({
      targets: [],
      steps: [],
      purchases: [],
      errors: [],
      budget: 0,
      profit: null,
    })
  })
})
