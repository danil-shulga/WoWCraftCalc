import { createCatalogCalculationSnapshot, getRecipeBatchCost } from './calculations'
import type { Item, ItemCatalog } from './item.types'
import { DEFAULT_TSM_SETTINGS, resolveItemPrice, tsmManifestSchema } from './tsm'
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
it('общий показатель меняет покупку, продажу и родителей без подстановок', () => {
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
  ).toBeNull()
  expect(
    resolveItemPrice(bar, 'purchasePriceCopper', { ...prices, snapshot: null }),
  ).toBeNull()
  expect(
    resolveItemPrice(bar, 'purchasePriceCopper', {
      ...prices,
      settings: { ...prices.settings, market: { ...market, faction: 'horde' } },
    }),
  ).toBeNull()
})
it('проверяет версию и ID, оставляет остальные workspace ручными', () => {
  expect(
    resolveItemPrice({ ...bar, source: undefined }, 'purchasePriceCopper', context),
  ).toBeNull()
  expect(
    resolveItemPrice(
      { ...bar, source: { wowheadItemId: 2, wowheadVersion: 'classic' } },
      'purchasePriceCopper',
      context,
    ),
  ).toBeNull()
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
