import { requireValue } from '../test/require-value'
import { createProfitabilitySnapshot, calculateProfitability } from './profitability'
import type { Item, ItemCatalog } from './item.types'
import { DEFAULT_TSM_SETTINGS, type PriceContext } from './tsm'
import { calculateDisenchant } from './disenchanting'

const item = (id: string, patch: Partial<Item> = {}): Item => ({
  id,
  name: id,
  iconUrl: '',
  sections: ['reagents'],
  purchasePriceCopper: null,
  salePriceCopper: null,
  recipe: null,
  ...patch,
})
const market = { region: 'eu', realm: 'thunderstrike', faction: 'alliance' } as const
const prices: PriceContext = {
  version: 'tbc',
  settings: { ...DEFAULT_TSM_SETTINGS, market },
  snapshot: {
    schemaVersion: 1,
    market,
    scannedAt: '2026-10-19T00:00:00Z',
    items: { '1': { recent: 100, marketValue: 200 } },
  },
}
const snapshot = (
  catalog: ItemCatalog,
  mode: 'buy' | 'sell' | 'craft' | 'disenchant',
  context = prices,
) => createProfitabilitySnapshot(catalog, mode, new Set(), context)

it('сравнивает оба показателя TSM и применяет фиксированную комиссию 5%', () => {
  const catalog = {
    a: item('a', { source: { wowheadItemId: 1 }, purchasePriceCopper: 0 }),
  }
  expect(calculateProfitability(requireValue(snapshot(catalog, 'buy')[0]))).toMatchObject(
    { cost: 100, gross: 200, gain: 90, percent: -50 },
  )
  expect(
    snapshot(catalog, 'buy', {
      ...prices,
      settings: { ...prices.settings, metric: 'marketValue' },
    }),
  ).toEqual(snapshot(catalog, 'buy'))
  expect(
    calculateProfitability(requireValue(snapshot(catalog, 'sell')[0])),
  ).toMatchObject({ cost: 200, gross: 100, gain: -105, percent: -50 })
})

it('сохраняет отрицательные и нулевые результаты покупки', () => {
  const catalog = { a: item('a', { source: { wowheadItemId: 1 } }) }
  for (const [recent, gain] of [
    [200, -10],
    [190, 0],
  ] as const) {
    const context = {
      ...prices,
      snapshot: {
        ...requireValue(prices.snapshot),
        items: { '1': { recent, marketValue: 200 } },
      },
    }
    const rows = snapshot(catalog, 'buy', context)
    expect(rows).toHaveLength(1)
    expect(calculateProfitability(requireValue(rows[0])).gain).toBe(gain)
  }
})

it('не подставляет ручные цены и сохраняет строки при отсутствии данных или чужом рынке', () => {
  const catalog = {
    a: item('a', { source: { wowheadItemId: 1 }, purchasePriceCopper: 10 }),
  }
  for (const context of [
    { ...prices, snapshot: null },
    { ...prices, version: 'classic' as const },
    {
      ...prices,
      settings: { ...prices.settings, market: { ...market, faction: 'horde' as const } },
    },
    {
      ...prices,
      snapshot: {
        ...requireValue(prices.snapshot),
        items: { '1': { recent: null, marketValue: 200 } },
      },
    },
  ]) {
    const rows = snapshot(catalog, 'buy', context)
    expect(rows).toHaveLength(1)
    expect(calculateProfitability(requireValue(rows[0]))).toMatchObject({
      gain: null,
      percent: null,
    })
    expect(rows[0]?.issue).not.toBeNull()
  }
})

const craftCatalog: ItemCatalog = {
  raw: item('raw', { purchasePriceCopper: 1 }),
  craft: item('craft', {
    salePriceCopper: 1,
    sections: ['crafts', 'reagents'],
    recipe: {
      outputQuantity: 3,
      profession: 'tailoring',
      reagents: [{ itemId: 'raw', quantity: 1, acquisition: 'buy' }],
    },
  }),
}

it('считает точный выход за единицу и не отбирает корни по профессии', () => {
  const rows = snapshot(craftCatalog, 'craft')
  expect(rows).toHaveLength(1)
  const row = calculateProfitability(requireValue(rows[0]))
  expect(row.issue).toBeNull()
  expect(row.cost).toBe(1 / 3)
  expect(row.gain).toBeCloseTo(0.95 - 1 / 3)
})

it('отличает нулевые затраты, неизвестную цену и убыток', () => {
  const catalog = structuredClone(craftCatalog)
  requireValue(catalog.raw).purchasePriceCopper = 0
  expect(
    calculateProfitability(requireValue(snapshot(catalog, 'craft')[0])),
  ).toMatchObject({ cost: 0, gain: 0.95, percent: null })
  requireValue(catalog.raw).purchasePriceCopper = 6
  expect(
    calculateProfitability(requireValue(snapshot(catalog, 'craft')[0])),
  ).toMatchObject({ cost: 2, gain: -1.05, percent: -52.5 })
  requireValue(catalog.raw).purchasePriceCopper = null
  expect(snapshot(catalog, 'craft')[0]?.issue).not.toBeNull()
})

it('использует точный выход распыления и сохраняет строки с недоступными материалами', () => {
  const boots = item('boots', {
    sections: ['disenchanting'],
    source: { wowheadItemId: 21853 },
    qualityId: 2,
    itemLevel: 108,
    classId: 4,
    subclassId: 1,
    inventoryType: 8,
    purchasePriceCopper: 100,
  })
  const catalog = {
    boots,
    dust: item('dust', { source: { wowheadItemId: 22445 }, salePriceCopper: 100 }),
    essence: item('essence', { source: { wowheadItemId: 22446 }, salePriceCopper: 200 }),
    shard: item('shard', { source: { wowheadItemId: 22449 }, salePriceCopper: 300 }),
  }
  const gross = requireValue(
    calculateDisenchant(
      boots,
      'tbc',
      new Map([
        [22445, 100],
        [22446, 200],
        [22449, 300],
      ]),
      { acceptUniformQuantities: true },
    ).exactExpectedValueCopper,
  )
  expect(
    calculateProfitability(requireValue(snapshot(catalog, 'disenchant')[0])).gain,
  ).toBeCloseTo(gross * 0.95 - 100)
  expect(snapshot({ boots }, 'disenchant')[0]?.issue).toContain('отсутствует')
  expect(
    snapshot(
      { ...catalog, duplicate: item('duplicate', { source: { wowheadItemId: 22445 } }) },
      'disenchant',
    )[0]?.issue,
  ).toContain('неоднозначный')
  expect(
    snapshot(catalog, 'disenchant', { ...prices, version: 'forever' })[0]?.issue,
  ).toContain('не поддерживается')
})

it('не выводит неконечные и небезопасные цены в строках без оценки', () => {
  const catalog = structuredClone(craftCatalog)
  requireValue(catalog.craft).salePriceCopper = Infinity
  const row = requireValue(snapshot(catalog, 'craft')[0])
  expect(row.gross).toBeNull()
  expect(row.issue).not.toBeNull()
  expect(calculateProfitability(row).gain).toBeNull()
})

it.each([
  [100, 90, 30],
  [10, 90, 10],
  [null, 1, 1 / 3],
  [100, null, 100],
  [100, 0, 0],
  [0, 90, 0],
  [null, null, null],
] as const)(
  'выбирает известные минимальные затраты распыления: покупка %s, реагенты %s',
  (purchase, reagentPrice, expectedCost) => {
    const catalog: ItemCatalog = {
      boots: item('boots', {
        sections: ['disenchanting'],
        source: { wowheadItemId: 21853 },
        qualityId: 2,
        itemLevel: 108,
        classId: 4,
        subclassId: 1,
        inventoryType: 8,
        purchasePriceCopper: purchase,
        recipe: {
          outputQuantity: 3,
          profession: 'tailoring',
          reagents: [{ itemId: 'raw', quantity: 1, acquisition: 'buy' }],
        },
      }),
      raw: item('raw', { purchasePriceCopper: reagentPrice }),
      dust: item('dust', { source: { wowheadItemId: 22445 }, salePriceCopper: 100 }),
      essence: item('essence', {
        source: { wowheadItemId: 22446 },
        salePriceCopper: 200,
      }),
      shard: item('shard', { source: { wowheadItemId: 22449 }, salePriceCopper: 300 }),
    }
    const row = calculateProfitability(requireValue(snapshot(catalog, 'disenchant')[0]))
    expect(row.cost).toBe(purchase)
    expect(row.craftCost).toBe(reagentPrice === null ? null : reagentPrice / 3)
    if (expectedCost === null) {
      expect(row.issue).toContain('Неизвестны')
      expect(row.gain).toBeNull()
      expect(row.percent).toBeNull()
    } else {
      expect(row.issue).toBeNull()
      const gain = requireValue(row.gross) * 0.95 - expectedCost
      expect(row.gain).toBeCloseTo(gain)
      if (expectedCost === 0) expect(row.percent).toBeNull()
      else expect(row.percent).toBeCloseTo((gain / expectedCost) * 100)
    }
  },
)

it('считает вложенный выход и преобразования эссенций без цикла', () => {
  const catalog: ItemCatalog = {
    raw: item('raw', { purchasePriceCopper: 1 }),
    thread: item('thread', {
      recipe: {
        outputQuantity: 3,
        profession: 'tailoring',
        reagents: [{ itemId: 'raw', quantity: 1, acquisition: 'buy' }],
      },
    }),
    robe: item('robe', {
      salePriceCopper: 2,
      recipe: {
        outputQuantity: 2,
        profession: null,
        reagents: [{ itemId: 'thread', quantity: 2, acquisition: 'craft' }],
      },
    }),
    small: item('small', {
      source: { wowheadItemId: 22447, wowheadVersion: 'tbc' },
      purchasePriceCopper: 10,
      salePriceCopper: 100,
    }),
    large: item('large', {
      source: { wowheadItemId: 22446, wowheadVersion: 'tbc' },
      purchasePriceCopper: 40,
      salePriceCopper: 100,
    }),
  }
  const rows = snapshot(catalog, 'craft')
  expect(rows.find((row) => row.itemId === 'robe')).toMatchObject({
    cost: 1 / 3,
    issue: null,
  })
  expect(rows.find((row) => row.itemId === 'large')).toMatchObject({
    cost: 30,
    issue: null,
  })
  expect(rows.find((row) => row.itemId === 'small')).toMatchObject({
    cost: 40 / 3,
    issue: null,
  })
})
