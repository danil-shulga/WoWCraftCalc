import { createCatalogCalculationSnapshot, getRecipeBatchCost } from './calculations'
import type { Item, ItemCatalog } from './item.types'
import {
  DEFAULT_TSM_SETTINGS,
  resolveItemPrice,
  tsmManifestSchema,
  usesTsmPrice,
} from './tsm'
import type { PriceContext } from './tsm'

const market = { region: 'eu', realm: 'thunderstrike', faction: 'alliance' } as const
const context: PriceContext = {
  version: 'tbc',
  settings: { ...DEFAULT_TSM_SETTINGS, market },
  snapshot: {
    schemaVersion: 1,
    market,
    scannedAt: '2026-01-01T00:00:00Z',
    items: {
      '1': { recent: 3, marketValue: 6 },
      '2': { recent: 10, marketValue: 20 },
      '3': { recent: 30, marketValue: null },
    },
  },
}
const ore: Item = {
  id: 'ore',
  name: 'Руда',
  iconUrl: '',
  sections: ['reagents'],
  source: { wowheadItemId: 1, wowheadVersion: 'tbc' },
  purchasePriceCopper: 0,
  salePriceCopper: 90,
  recipe: null,
}
const bar: Item = {
  ...ore,
  id: 'bar',
  source: { wowheadItemId: 2 },
  purchasePriceCopper: 20,
  purchasePriceSource: 'tsm',
  recipe: {
    outputQuantity: 2,
    profession: 'mining',
    reagents: [{ itemId: 'ore', quantity: 3, acquisition: 'buy' }],
  },
}
const sword: Item = {
  ...ore,
  id: 'sword',
  source: { wowheadItemId: 3 },
  salePriceSource: 'tsm',
  recipe: {
    outputQuantity: 1,
    profession: 'blacksmithing',
    reagents: [{ itemId: 'bar', quantity: 2, acquisition: 'craft' }],
  },
}
const catalog: ItemCatalog = { ore, bar, sword }

describe.each(['individual', 'tsm'] as const)('приоритет %s', (priceMode) => {
  describe.each(['manual', 'tsm', undefined] as const)('источник %s', (source) => {
    it.each(['purchasePriceCopper', 'salePriceCopper'] as const)(
      'выбирает %s с запасным источником и согласованной подписью',
      (field) => {
        for (const manual of [90, 0, null]) {
          for (const tsm of [3, null]) {
            const candidate: Item = {
              ...ore,
              [field]: manual,
              ...(field === 'purchasePriceCopper'
                ? { purchasePriceSource: source }
                : { salePriceSource: source }),
            }
            const prices: PriceContext = {
              ...context,
              settings: { ...context.settings, priceMode },
              snapshot: {
                schemaVersion: 1,
                market,
                scannedAt: '2026-01-01T00:00:00Z',
                items: { '1': { recent: tsm, marketValue: 123 } },
              },
            }
            const preferTsm = priceMode === 'tsm' || source === 'tsm'
            const expected = preferTsm ? (tsm ?? manual) : (manual ?? tsm)
            expect(resolveItemPrice(candidate, field, prices)).toBe(expected)
            expect(usesTsmPrice(candidate, field, prices)).toBe(
              tsm !== null && (preferTsm || manual === null),
            )
          }
        }
      },
    )
  })
})

it.each(['classic', 'forever', undefined] as const)(
  'вне TBC не подставляет TSM: %s',
  (version) => {
    const prices = version ? { ...context, version } : undefined
    const candidate = { ...bar, purchasePriceCopper: null }
    expect(resolveItemPrice(candidate, 'purchasePriceCopper', prices)).toBeNull()
    expect(usesTsmPrice(candidate, 'purchasePriceCopper', prices)).toBe(false)
  },
)

it('не использует недоступный TSM, другой показатель или ручную цену другого направления', () => {
  const candidate: Item = { ...sword, purchasePriceCopper: null, salePriceCopper: 90 }
  const contexts: PriceContext[] = [
    { ...context, snapshot: null },
    { ...context, settings: { ...context.settings, market: null } },
    { ...context, settings: { ...context.settings, metric: 'marketValue' } },
    {
      ...context,
      settings: { ...context.settings, market: { ...market, faction: 'horde' } },
    },
  ]
  for (const prices of contexts) {
    expect(resolveItemPrice(candidate, 'purchasePriceCopper', prices)).toBeNull()
    expect(usesTsmPrice(candidate, 'purchasePriceCopper', prices)).toBe(false)
    expect(resolveItemPrice(candidate, 'salePriceCopper', prices)).toBe(90)
    expect(usesTsmPrice(candidate, 'salePriceCopper', prices)).toBe(false)
  }
  for (const source of [
    undefined,
    { wowheadItemId: 999 },
    { wowheadItemId: 3, wowheadVersion: 'classic' as const },
  ]) {
    const unavailable = { ...candidate, source }
    expect(resolveItemPrice(unavailable, 'purchasePriceCopper', context)).toBeNull()
    expect(resolveItemPrice(unavailable, 'salePriceCopper', context)).toBe(90)
    expect(usesTsmPrice(unavailable, 'salePriceCopper', context)).toBe(false)
  }
})

it('подстановка TSM пересчитывает вложенный крафт, сценарии и фактические источники', () => {
  const items = {
    ...catalog,
    ore: { ...ore, purchasePriceCopper: null },
    sword: { ...sword, salePriceCopper: null, salePriceSource: 'manual' as const },
  }
  const before = JSON.stringify(items)
  const result = createCatalogCalculationSnapshot(
    items,
    new Set(['mining']),
    new Set(['sword']),
    context,
  )
  expect(result.ore).toMatchObject({
    purchasePrice: 3,
    purchaseIsTsm: true,
    saleIsTsm: false,
  })
  expect(result.sword).toMatchObject({
    salePrice: 30,
    saleIsTsm: true,
    configuredProfit: 21,
    boughtReagentsProfit: 10,
  })
  expect(JSON.stringify(items)).toBe(before)
})

it('сохраняет ручной ноль, смешанные источники и вложенный выход', () => {
  expect(resolveItemPrice(ore, 'purchasePriceCopper', context)).toBe(0)
  expect(resolveItemPrice(bar, 'purchasePriceCopper', context)).toBe(10)
  const result = createCatalogCalculationSnapshot(
    catalog,
    new Set(['mining']),
    new Set(['sword']),
    context,
  )
  expect(result.sword?.configuredProfit).toBe(30)
  expect(result.sword?.boughtReagentsProfit).toBe(10)
  expect(result.bar?.automaticMethod).toBe('craft')
})
it('все по TSM охватывает оба направления и сценарии, переключение восстанавливает суммы', () => {
  const all = { ...context, settings: { ...context.settings, priceMode: 'tsm' as const } }
  expect(getRecipeBatchCost(catalog, 'sword', { prices: all })).toBe(9)
  const result = createCatalogCalculationSnapshot(
    catalog,
    new Set(['mining']),
    new Set(['sword']),
    all,
  )
  expect(result.sword).toMatchObject({
    purchasePrice: 30,
    salePrice: 30,
    configuredProfit: 21,
    allProfessionsProfit: 21,
    boughtReagentsProfit: 10,
  })
  expect(resolveItemPrice(ore, 'salePriceCopper', all)).toBe(3)
  expect(resolveItemPrice(ore, 'salePriceCopper', context)).toBe(90)
  expect(ore.purchasePriceCopper).toBe(0)
})
it('общий показатель меняет вложенные расчёты и допускает ручную подстановку', () => {
  const prices = {
    ...context,
    settings: {
      ...context.settings,
      metric: 'marketValue' as const,
      priceMode: 'tsm' as const,
    },
  }
  expect(resolveItemPrice(bar, 'purchasePriceCopper', prices)).toBe(20)
  expect(getRecipeBatchCost(catalog, 'sword', { prices })).toBe(18)
  expect(
    createCatalogCalculationSnapshot(catalog, new Set(), new Set(['sword']), prices).sword
      ?.configuredProfit,
  ).toBe(72)
  expect(
    resolveItemPrice(bar, 'purchasePriceCopper', { ...prices, snapshot: null }),
  ).toBe(20)
  expect(
    resolveItemPrice(bar, 'purchasePriceCopper', {
      ...prices,
      settings: { ...prices.settings, market: { ...market, faction: 'horde' } },
    }),
  ).toBe(20)
})
it('проверяет версию и ID, оставляет остальные workspace ручными', () => {
  expect(
    resolveItemPrice({ ...bar, source: undefined }, 'purchasePriceCopper', context),
  ).toBe(20)
  expect(
    resolveItemPrice(
      { ...bar, source: { wowheadItemId: 2, wowheadVersion: 'classic' } },
      'purchasePriceCopper',
      context,
    ),
  ).toBe(20)
  expect(
    resolveItemPrice(bar, 'purchasePriceCopper', { ...context, version: 'classic' }),
  ).toBe(20)
})
it('отклоняет пути manifest вне снимка выбранного рынка', () => {
  expect(
    tsmManifestSchema.safeParse({
      schemaVersion: 1,
      generatedAt: '2026-01-01T00:00:00Z',
      markets: [
        {
          market,
          scannedAt: '2026-01-01T00:00:00Z',
          contentId: 'a'.repeat(64),
          path: '../other.json',
        },
      ],
    }).success,
  ).toBe(false)
})
