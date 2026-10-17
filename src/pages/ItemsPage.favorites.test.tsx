import { items } from '../test/items-page-fixture'
import { testCraftData, setTestCraftState } from '../test/craft-state'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useCraftStore } from '../store/useCraftStore'
import { ItemsPage } from './ItemsPage'

describe('ItemsPage: favorites', () => {
  beforeEach(() => {
    useCraftStore.getState().replaceData(testCraftData({ items, itemLanguage: 'ru' }))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('переключает звёздочку и запрашивает подтверждение только при удалении из избранного', async () => {
    const user = userEvent.setup()
    render(<ItemsPage section="crafts" />)
    const label = 'Лечебное зелье'
    const star = screen.getByRole('button', { name: `Добавить в избранное: ${label}` })
    expect(star).toHaveAttribute('aria-pressed', 'false')
    await user.click(star)
    expect(star).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(star)
    const dialog = screen.getByRole('dialog', { name: 'Удалить из избранного?' })
    expect(star).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(dialog).getByRole('button', { name: 'Отмена' }))
    expect(star).toHaveFocus()
    expect(star).toHaveAttribute('aria-pressed', 'true')
    await user.keyboard('{Enter}')
    await user.click(screen.getByRole('button', { name: 'Удалить из избранного' }))
    expect(star).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText(label)).toBeVisible()
  })

  it('показывает только избранные предметы и убирает их после подтверждения', async () => {
    const user = userEvent.setup()
    useCraftStore.getState().setItemFavorite('potion', true)
    render(<ItemsPage section="favorites" />)
    expect(screen.getByRole('heading', { name: 'Избранное' })).toBeVisible()
    expect(screen.queryByText('Шерстяная сумка')).not.toBeInTheDocument()
    await user.type(screen.getByRole('searchbox'), 'HEALING')
    expect(screen.getByText('Лечебное зелье')).toBeVisible()
    await user.click(
      screen.getByRole('button', { name: 'Удалить из избранного: Лечебное зелье' }),
    )
    await user.click(screen.getByRole('button', { name: 'Удалить из избранного' }))
    const leavingTree = screen.getByText('Лечебное зелье').closest('.item-tree')
    if (!leavingTree) throw new Error('Нет уходящего дерева')
    expect(leavingTree).toHaveAttribute('inert')
    expect(leavingTree).toHaveAttribute('aria-hidden', 'true')
    fireEvent.animationEnd(leavingTree)
    expect(screen.getByText('Здесь пока ничего нет')).toBeVisible()
    const state = useCraftStore.getState()
    expect(state.workspaces[state.activeVersion].items.potion).toBeDefined()
  })

  it('даёт добавлять вложенный реагент в избранное без сворачивания дерева', async () => {
    const user = userEvent.setup()
    const potion = items.potion
    const bag = items.bag
    if (!potion || !bag) throw new Error('Нет тестовых предметов')
    setTestCraftState({
      items: {
        potion: {
          ...potion,
          recipe: {
            outputQuantity: 1,
            profession: null,
            reagents: [{ itemId: 'bag', quantity: 1, acquisition: 'buy' }],
          },
        },
        bag: { ...bag, sections: ['reagents'] },
      },
    })
    render(<ItemsPage section="crafts" />)
    await user.click(screen.getByRole('button', { name: 'Развернуть рецепт' }))
    await user.click(
      screen.getByRole('button', { name: 'Добавить в избранное: Шерстяная сумка' }),
    )
    expect(
      screen.getByRole('button', { name: 'Удалить из избранного: Шерстяная сумка' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Свернуть рецепт' })).toBeVisible()
  })
})
