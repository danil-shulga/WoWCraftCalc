import type { Item, ItemCatalog } from './item.types'
import {
  createCatalogDisenchantSnapshot,
  resolveDisenchantMaterialPrices,
} from './disenchanting-catalog'
import { DEFAULT_TSM_SETTINGS } from './tsm'
import { calculateDisenchantComparison, getDisenchantProfit } from './disenchanting'
import { getExactCraftUnitCost } from './calculations'
import type { Profession } from './professions'

function item(id: string, input: Partial<Item> = {}): Item {
  return {
    id,
    name: id,
    iconUrl: '',
    sections: ['reagents'],
    purchasePriceCopper: null,
    salePriceCopper: null,
    recipe: null,
    ...input,
  }
}

const catalog: ItemCatalog = {
  boots: item('boots', {
    source: { wowheadItemId: 21853 },
    itemLevel: 108,
    requiredLevel: 0,
    qualityId: 2,
    classId: 4,
    subclassId: 1,
    inventoryType: 8,
    purchasePriceCopper: 100,
    recipe: {
      outputQuantity: 3,
      profession: 'tailoring',
      reagents: [{ itemId: 'cloth', quantity: 1, acquisition: 'buy' }],
    },
  }),
  cloth: item('cloth', { purchasePriceCopper: 1 }),
  dust: item('dust', { source: { wowheadItemId: 22445 }, salePriceCopper: 100 }),
  essence: item('essence', { source: { wowheadItemId: 22446 }, salePriceCopper: 100 }),
  shard: item('shard', { source: { wowheadItemId: 22449 }, salePriceCopper: 100 }),
}

describe('распыление предметов каталога', () => {
  it.each([null, 0, 1, 100])(
    'изолирует сценарии и порядок обхода общих реагентов при цене %s',
    (purchasePriceCopper) => {
      const boots = catalog.boots
      if (!boots?.recipe) throw new Error('Нет рецепта')
      const items: ItemCatalog = {
        ...catalog,
        raw: item('raw', { purchasePriceCopper }),
        cloth: item('cloth', {
          purchasePriceCopper: 10,
          recipe: {
            outputQuantity: 3,
            profession: 'tailoring',
            reagents: [{ itemId: 'raw', quantity: 1, acquisition: 'buy' }],
          },
        }),
        boots: {
          ...boots,
          recipe: {
            ...boots.recipe,
            reagents: [{ itemId: 'cloth', quantity: 2, acquisition: 'auto' }],
          },
        },
        other: {
          ...boots,
          id: 'other',
          recipe: {
            ...boots.recipe,
            reagents: [{ itemId: 'cloth', quantity: 5, acquisition: 'craft' }],
          },
        },
      }
      const ids = ['boots', 'other']
      for (const ownedProfessions of [
        new Set<Profession>(),
        new Set<Profession>(['tailoring']),
      ]) {
        const snapshot = createCatalogDisenchantSnapshot(
          items,
          'tbc',
          ids,
          ownedProfessions,
        )
        expect(
          createCatalogDisenchantSnapshot(
            items,
            'tbc',
            [...ids].reverse(),
            ownedProfessions,
          ),
        ).toEqual(snapshot)
        const { salePrices } = resolveDisenchantMaterialPrices(items, 'tbc')
        for (const id of ids) {
          const comparison = calculateDisenchantComparison(items, id, 'tbc', salePrices, {
            ownedProfessions,
            acceptUniformQuantities: true,
          })
          expect(snapshot[id]).toMatchObject({
            result: comparison.disenchant,
            buyProfit: comparison.buyProfitCopper,
            configuredProfit: comparison.craftProfitCopper,
            allProfessionsProfit: getDisenchantProfit(
              comparison.disenchant,
              getExactCraftUnitCost(items, id, { scenario: 'all-professions' }),
            ),
            boughtReagentsProfit: getDisenchantProfit(
              comparison.disenchant,
              getExactCraftUnitCost(items, id, { scenario: 'buy-reagents' }),
            ),
          })
        }
      }
    },
  )

  it.each(['classic', 'tbc'] as const)(
    'разрешает материалы старого мира только из своей версии %s',
    (version) => {
      const boots = catalog.boots
      if (!boots) throw new Error('Нет предмета')
      const items = {
        boots: {
          ...boots,
          itemLevel: 51,
          source: { wowheadItemId: 13856, wowheadVersion: version },
          recipe: null,
        },
        dust: item('dust', {
          source: { wowheadItemId: 11176, wowheadVersion: version },
          salePriceCopper: 100,
        }),
        essence: item('essence', {
          source: { wowheadItemId: 16202 },
          salePriceCopper: 100,
        }),
        shard: item('shard', { source: { wowheadItemId: 14343 }, salePriceCopper: 100 }),
        foreign: item('foreign', {
          source: {
            wowheadItemId: 11176,
            wowheadVersion:
              version === 'classic' ? ('tbc' as const) : ('classic' as const),
          },
          salePriceCopper: 999,
        }),
      }
      const snapshot = createCatalogDisenchantSnapshot(
        items,
        version,
        ['boots'],
        new Set(),
      )
      expect(snapshot.boots?.result.expectedValueCopper).toBe(298)
      expect(snapshot.boots?.configuredProfit).toBe(198)
      expect(snapshot.boots?.materialIssues).toEqual([])
      expect(
        createCatalogDisenchantSnapshot(
          { ...items, copy: { ...items.dust, id: 'copy' } },
          version,
          ['boots'],
          new Set(),
        ).boots?.materialIssues,
      ).toEqual([
        { itemId: 11176, kind: 'ambiguous-material', candidates: ['dust', 'copy'] },
      ])
    },
  )

  it('разрешает цены продажи по игровому ID, не изменяя каталог и дробную себестоимость', () => {
    const result = createCatalogDisenchantSnapshot(
      catalog,
      'tbc',
      ['boots'],
      new Set(),
    ).boots
    expect(result?.result.expectedValueCopper).toBe(299)
    expect(result?.configuredProfit).toBe(298)
    expect(result?.buyProfit).toBe(199)
    expect(result?.materialIssues).toEqual([])
    expect(result?.result.assumptions).toEqual(['uniform-quantities'])
    expect(catalog.boots?.sections).toEqual(['reagents'])
  })

  it('при отсутствии рецепта сравнивает покупку и распыление', () => {
    const boots = catalog.boots
    if (!boots) throw new Error('Нет предмета')
    expect(
      createCatalogDisenchantSnapshot(
        { ...catalog, boots: { ...boots, recipe: null } },
        'tbc',
        ['boots'],
        new Set(),
      ).boots?.configuredProfit,
    ).toBe(199)
  })

  it('отклоняет неоднозначность даже при одинаковых ценах и не сопоставляет по имени', () => {
    const result = createCatalogDisenchantSnapshot(
      {
        ...catalog,
        copy: item('copy', {
          source: { wowheadItemId: 22445, wowheadVersion: 'tbc' },
          salePriceCopper: 100,
        }),
        fake: item('fake', { name: 'dust', salePriceCopper: 100 }),
      },
      'tbc',
      ['boots'],
      new Set(),
    ).boots
    expect(result?.result.expectedValueCopper).toBeNull()
    expect(result?.materialIssues).toEqual([
      { itemId: 22445, kind: 'ambiguous-material', candidates: ['dust', 'copy'] },
    ])
    expect(result?.configuredProfit).toBeNull()
  })

  it('различает отсутствующий материал, неизвестную цену, чужую версию и ручной ноль', () => {
    const { salePrices, issues } = resolveDisenchantMaterialPrices(
      {
        dust: item('dust', {
          source: { wowheadItemId: 22445, wowheadVersion: 'classic' },
          salePriceCopper: 10,
        }),
        essence: item('essence', {
          source: { wowheadItemId: 22446 },
          salePriceCopper: 0,
        }),
        shard: item('shard', { source: { wowheadItemId: 22449 } }),
      },
      'tbc',
    )
    expect(salePrices.get(22445)).toBeNull()
    expect(salePrices.get(22446)).toBe(0)
    expect(issues).toContainEqual({
      itemId: 22445,
      kind: 'missing-material',
      candidates: [],
    })
    expect(issues).toContainEqual({
      itemId: 22449,
      kind: 'missing-price',
      candidates: ['shard'],
    })
  })

  it('использует текущий TSM и подставляет ручную цену при отсутствии снимка', () => {
    const dust = catalog.dust
    if (!dust) throw new Error('Нет материала')
    const items = { ...catalog, dust: { ...dust, salePriceSource: 'tsm' as const } }
    const market = { region: 'eu', realm: 'thunderstrike', faction: 'alliance' } as const
    const context = {
      version: 'tbc' as const,
      settings: { ...DEFAULT_TSM_SETTINGS, market },
      snapshot: {
        schemaVersion: 1 as const,
        market,
        scannedAt: '2026-10-16T12:00:00Z',
        items: { '22445': { recent: 200, marketValue: null } },
      },
    }
    expect(
      resolveDisenchantMaterialPrices(items, 'tbc', context).salePrices.get(22445),
    ).toBe(200)
    expect(
      resolveDisenchantMaterialPrices(items, 'tbc', {
        ...context,
        snapshot: null,
      }).salePrices.get(22445),
    ).toBe(100)
  })

  it('подставляет TSM для материалов и ручную покупку при приоритете TSM', () => {
    const market = { region: 'eu', realm: 'thunderstrike', faction: 'alliance' } as const
    const dust = catalog.dust
    if (!dust) throw new Error('Нет материала')
    const items = { ...catalog, dust: { ...dust, salePriceCopper: null } }
    const prices = {
      version: 'tbc' as const,
      settings: { ...DEFAULT_TSM_SETTINGS, market },
      snapshot: {
        schemaVersion: 1 as const,
        market,
        scannedAt: '2026-01-01T00:00:00Z',
        items: { '22445': { recent: 100, marketValue: null } },
      },
    }
    for (const priceMode of ['individual', 'tsm'] as const) {
      const result = createCatalogDisenchantSnapshot(items, 'tbc', ['boots'], new Set(), {
        ...prices,
        settings: { ...prices.settings, priceMode },
      }).boots
      expect(result).toMatchObject({
        configuredProfit: 298,
        buyProfit: 199,
        materialIssues: [],
      })
      expect(result?.result.expectedValueCopper).toBe(299)
    }
    const unknown = createCatalogDisenchantSnapshot(items, 'tbc', ['boots'], new Set(), {
      ...prices,
      snapshot: null,
    }).boots
    expect(unknown?.buyProfit).toBeNull()
    expect(unknown?.materialIssues).toContainEqual({
      itemId: 22445,
      kind: 'missing-price',
      candidates: ['dust'],
    })
  })

  it('сохраняет неподдерживаемый статус вместо нулей', () => {
    const result = createCatalogDisenchantSnapshot(
      catalog,
      'classic',
      ['boots'],
      new Set(),
    ).boots
    expect(result?.result.status).toBe('unsupported-rule')
    expect(result?.configuredProfit).toBeNull()
    expect(result?.materialIssues).toEqual([])
  })
})
