import type { Item, Recipe } from '../domain/item.types'
import { setTestCraftState } from '../test/craft-state'
import { selectActiveItems } from './craft.selectors'
import { useCraftStore } from './useCraftStore'

const product: Item = {
  id: 'product',
  name: 'Мой предмет',
  names: { ru: 'Мой предмет', en: null },
  iconUrl: 'https://example.com/custom.jpg',
  sections: ['reagents'],
  purchasePriceCopper: 0,
  salePriceCopper: 100,
  recipe: null,
}
const reagent: Item = {
  ...product,
  id: 'reagent',
  name: 'Ткань',
  names: { ru: 'Ткань', en: null },
  purchasePriceCopper: 42,
  recipe: null,
  source: { wowheadItemId: 2 },
}
const recipe: Recipe = {
  outputQuantity: 3,
  profession: 'tailoring',
  reagents: [{ itemId: 'reagent', quantity: 2, acquisition: 'buy' }],
}
const imported = {
  product: { wowheadItemId: 1, name: 'Предмет из базы', iconUrl: '' },
  reagents: [{ wowheadItemId: 2, name: 'Ткань', iconUrl: '', quantity: 5 }],
  outputQuantity: 4,
  profession: 'tailoring' as const,
}

describe('общее редактирование предмета', () => {
  beforeEach(() => {
    useCraftStore.getState().setActiveVersion('forever')
    setTestCraftState({ items: { product, reagent } })
  })

  it('сохраняет описание и рецепт одним обновлением', () => {
    const listener = vi.fn()
    const unsubscribe = useCraftStore.subscribe(listener)
    try {
      expect(
        useCraftStore
          .getState()
          .saveItemEdit(product.id, { ...product, name: 'Новое имя' }, recipe),
      ).toBeNull()
      expect(listener).toHaveBeenCalledTimes(1)
      expect(selectActiveItems(useCraftStore.getState()).product).toMatchObject({
        name: 'Новое имя',
        recipe,
      })
    } finally {
      unsubscribe()
    }
  })

  it.each([0, 1.5, Number.NaN])(
    'не сохраняет описание при неверном количестве %s',
    (quantity) => {
      const before = useCraftStore.getState()
      expect(
        before.saveItemEdit(
          product.id,
          { ...product, name: 'Новое имя' },
          { ...recipe, outputQuantity: quantity },
        ),
      ).not.toBeNull()
      expect(useCraftStore.getState()).toBe(before)
    },
  )

  it('отклоняет цикл без сохранения описания', () => {
    const before = useCraftStore.getState()
    expect(
      before.saveItemEdit(
        product.id,
        { ...product, name: 'Новое имя' },
        {
          ...recipe,
          reagents: [{ itemId: product.id, quantity: 1, acquisition: 'auto' }],
        },
      ),
    ).toContain('циклическую')
    expect(useCraftStore.getState()).toBe(before)
  })

  it('привязывает импорт к ручному предмету, сохраняет описание и выбор получения', () => {
    setTestCraftState({ items: { product: { ...product, recipe }, reagent } })
    const listener = vi.fn()
    const unsubscribe = useCraftStore.subscribe(listener)
    try {
      const result = useCraftStore.getState().importRecipe(imported, undefined, {
        itemId: product.id,
        input: { ...product, salePriceCopper: 200 },
      })
      expect(result).toEqual({
        success: true,
        productCreated: false,
        productItemId: product.id,
        reagentsCreated: 0,
      })
      expect(listener).toHaveBeenCalledTimes(1)
      const items = selectActiveItems(useCraftStore.getState())
      expect(Object.keys(items)).toHaveLength(2)
      expect(items.product).toMatchObject({
        ...product,
        salePriceCopper: 200,
        source: { wowheadItemId: 1 },
        recipe: {
          outputQuantity: 4,
          profession: 'tailoring',
          reagents: [{ itemId: 'reagent', quantity: 5, acquisition: 'buy' }],
        },
      })
      expect(items.reagent?.purchasePriceCopper).toBe(42)
    } finally {
      unsubscribe()
    }
  })

  it('отклоняет рецепт другого результата для предмета с источником', () => {
    setTestCraftState({
      items: { product: { ...product, source: { wowheadItemId: 99 } }, reagent },
    })
    const before = useCraftStore.getState()
    const result = before.importRecipe(imported, undefined, {
      itemId: product.id,
      input: product,
    })
    expect(result.success).toBe(false)
    if (result.success) throw new Error('Ожидалось отклонение рецепта')
    expect(result.error).toContain('другой предмет')
    expect(useCraftStore.getState()).toBe(before)
  })

  it('не применяет импорт с циклом и не создаёт реагенты частично', () => {
    setTestCraftState({
      items: {
        product,
        reagent: {
          ...reagent,
          recipe: {
            ...recipe,
            reagents: [{ itemId: 'product', quantity: 1, acquisition: 'auto' }],
          },
        },
      },
    })
    const before = useCraftStore.getState()
    expect(
      before.importRecipe(
        {
          ...imported,
          reagents: [
            ...imported.reagents,
            { wowheadItemId: 3, name: 'Новый реагент', iconUrl: '', quantity: 1 },
          ],
        },
        undefined,
        { itemId: product.id, input: product },
      ),
    ).toMatchObject({ success: false })
    expect(useCraftStore.getState()).toBe(before)
  })

  it('отклоняет сохранение и импорт после смены workspace', () => {
    const before = useCraftStore.getState()
    const expected = { version: before.activeVersion, revision: before.workspaceRevision }
    before.setActiveVersion('tbc')
    before.setActiveVersion('forever')
    const current = useCraftStore.getState()
    expect(current.saveItemEdit(product.id, product, recipe, expected)).toContain(
      'Версия игры изменилась',
    )
    expect(
      current.importRecipe(imported, expected, { itemId: product.id, input: product }),
    ).toMatchObject({ success: false })
    expect(useCraftStore.getState()).toBe(current)
  })
})
