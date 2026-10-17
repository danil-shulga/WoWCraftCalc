import { getEssenceConversion } from './essence-conversion'
import {
  getAutomaticAcquisitionMethod,
  getCraftUnitCost,
  getRecipeBatchCost,
} from './calculations'
import { calculateCraftPlan } from './planner'
import { getCatalogValidationError } from './recipe-validation'
import type { Item, ItemCatalog } from './item.types'

function essence(id: string, wowheadItemId: number, price: number | null): Item {
  return {
    id,
    name: id,
    iconUrl: '',
    sections: ['reagents'],
    recipe: null,
    source: { wowheadItemId, wowheadVersion: 'classic' },
    purchasePriceCopper: price,
    salePriceCopper: 100,
  }
}
const catalog = {
  small: essence('small', 10938, 10),
  large: essence('large', 10939, 90),
} satisfies ItemCatalog

describe('преобразование эссенций', () => {
  it.each([
    [10938, 10939],
    [10998, 11082],
    [11134, 11135],
    [11174, 11175],
    [16202, 16203],
    [22447, 22446],
  ])('использует пропорцию 3:1 для пары %i/%i в TBC', (small, large) => {
    const pair: ItemCatalog = {
      small: {
        ...essence('small', small, 10),
        source: { wowheadItemId: small, wowheadVersion: 'tbc' },
      },
      large: {
        ...essence('large', large, 90),
        source: { wowheadItemId: large, wowheadVersion: 'tbc' },
      },
    }
    expect(getRecipeBatchCost(pair, 'small')).toBe(90)
    expect(getRecipeBatchCost(pair, 'large')).toBe(30)
  })

  it('учитывает старые записи без версии источника и не предлагает планарную пару в Classic', () => {
    const legacy = {
      ...catalog,
      small: { ...catalog.small, source: { wowheadItemId: 10938 } },
    }
    expect(getRecipeBatchCost(legacy, 'large')).toBe(30)
    expect(getRecipeBatchCost(legacy, 'small')).toBe(90)
    expect(
      getEssenceConversion(
        { small: essence('small', 22447, 10), large: essence('large', 22446, 90) },
        'large',
      ),
    ).toBeNull()
  })

  it('собирает три малые и разбирает большую без обратной цепочки и профессии', () => {
    expect(getCraftUnitCost(catalog, 'large')).toBe(30)
    expect(getRecipeBatchCost(catalog, 'small')).toBe(90)
    expect(getRecipeBatchCost(catalog, 'small', { scenario: 'all-professions' })).toBe(90)
    expect(getRecipeBatchCost(catalog, 'large', { scenario: 'all-professions' })).toBe(30)
    expect(getAutomaticAcquisitionMethod(catalog, 'large', new Set())).toBe('craft')
    expect(getAutomaticAcquisitionMethod(catalog, 'small', new Set())).toBe('buy')
    expect(getCatalogValidationError(catalog)).toBeNull()
    expect(catalog.small.recipe).toBeNull()
  })

  it('сохраняет неизвестную цену и ноль', () => {
    expect(
      getCraftUnitCost({ ...catalog, small: essence('small', 10938, null) }, 'large'),
    ).toBeNull()
    expect(
      getCraftUnitCost({ ...catalog, small: essence('small', 10938, 0) }, 'large'),
    ).toBe(0)
  })

  it('не выбирает произвольный дубликат, отсутствующую пару или чужую версию', () => {
    expect(getEssenceConversion({ small: catalog.small }, 'small')).toBeNull()
    expect(
      getEssenceConversion(
        { ...catalog, duplicate: essence('duplicate', 10938, 1) },
        'large',
      ),
    ).toBeNull()
    expect(
      getEssenceConversion(
        {
          ...catalog,
          large: {
            ...catalog.large,
            source: { wowheadItemId: 10939, wowheadVersion: 'tbc' },
          },
        },
        'small',
      ),
    ).toBeNull()
  })

  it('сохраняет приоритет ручного рецепта', () => {
    const manual: ItemCatalog = {
      ...catalog,
      large: {
        ...catalog.large,
        recipe: {
          outputQuantity: 1,
          profession: null,
          reagents: [{ itemId: 'small', quantity: 2, acquisition: 'buy' }],
        },
      },
    }
    expect(getEssenceConversion(manual, 'large')).toBeNull()
    expect(getCraftUnitCost(manual, 'large')).toBe(20)
  })

  it('считает обе цели независимо, округляет разборку и покупает исходные материалы', () => {
    for (const targets of [
      [
        { itemId: 'small', quantity: 4 },
        { itemId: 'large', quantity: 1 },
      ],
      [
        { itemId: 'large', quantity: 1 },
        { itemId: 'small', quantity: 4 },
      ],
    ]) {
      const result = calculateCraftPlan(catalog, targets)
      expect(result.errors).toEqual([])
      expect(result.budget).toBe(210)
      expect(result.steps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            itemId: 'small',
            craftCount: 2,
            producedQuantity: 6,
            surplusQuantity: 2,
          }),
          expect.objectContaining({
            itemId: 'large',
            craftCount: 1,
            producedQuantity: 1,
          }),
        ]),
      )
      expect(result.purchases).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ itemId: 'small', quantity: 3 }),
          expect.objectContaining({ itemId: 'large', quantity: 2 }),
        ]),
      )
    }
  })

  it('объединяет эссенции из нескольких вложенных крафтов до округления', () => {
    const recipe = {
      outputQuantity: 1,
      profession: null,
      reagents: [{ itemId: 'small', quantity: 2, acquisition: 'craft' as const }],
    }
    const nested = {
      ...catalog,
      a: { ...essence('a', 1, 100), recipe },
      b: { ...essence('b', 2, 100), recipe },
    }
    const result = calculateCraftPlan(nested, [
      { itemId: 'a', quantity: 1 },
      { itemId: 'b', quantity: 1 },
    ])
    expect(result.errors).toEqual([])
    expect(result.purchases).toMatchObject([{ itemId: 'large', quantity: 2 }])
    expect(result.steps[0]).toMatchObject({
      itemId: 'small',
      requiredQuantity: 4,
      surplusQuantity: 2,
    })
  })
})
