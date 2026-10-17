import { items } from '../test/items-page-fixture'
import { testCraftData } from '../test/craft-state'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useCraftStore } from '../store/useCraftStore'
import { ItemsPage } from './ItemsPage'

describe('ItemsPage: planner', () => {
  beforeEach(() => {
    useCraftStore.getState().replaceData(testCraftData({ items, itemLanguage: 'ru' }))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('показывает тележку только корням и синхронизирует количество между разделами', async () => {
    const user = userEvent.setup()
    const potion = items.potion
    if (!potion) throw new Error('Нет предмета')
    useCraftStore.getState().replaceData(
      testCraftData({
        items: {
          ...items,
          potion: {
            ...potion,
            isFavorite: true,
            sections: ['crafts', 'reagents'],
            recipe: {
              outputQuantity: 3,
              profession: null,
              reagents: [{ itemId: 'bag', quantity: 1, acquisition: 'buy' }],
            },
          },
        },
      }),
    )
    const view = render(<ItemsPage section="crafts" />)
    const row = screen.getByRole('button', { name: 'Развернуть рецепт' })
    const cart = screen.getByRole('button', { name: 'Добавить в план: Лечебное зелье' })
    fireEvent.pointerDown(cart, { button: 0, pointerType: 'mouse' })
    await user.click(cart)
    expect(row).toHaveAttribute('aria-expanded', 'false')
    expect(view.container.querySelector('.item-list--dragging')).toBeNull()
    expect(screen.getByRole('spinbutton')).toHaveValue(3)
    await user.click(row)
    const branch = view.container.querySelector('.item-tree--nested')
    if (!branch) throw new Error('Нет ветки')
    expect(
      within(branch as HTMLElement).queryByRole('button', { name: /в план:/ }),
    ).toBeNull()
    view.rerender(<ItemsPage section="favorites" />)
    expect(screen.getByRole('spinbutton')).toHaveValue(3)
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '4' } })
    view.rerender(<ItemsPage section="reagents" />)
    expect(screen.getByRole('spinbutton')).toHaveValue(4)
  })
})
