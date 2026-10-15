import { setTestCraftState, testCraftData } from '../test/craft-state'
import {
  act,
  createEvent,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { AcquisitionMethod, ItemCatalog } from '../domain/item.types'
import { useCraftStore } from '../store/useCraftStore'
import { ItemsPage } from './ItemsPage'

const items: ItemCatalog = {
  potion: {
    id: 'potion',
    name: 'Лечебное зелье',
    names: { ru: 'Лечебное зелье', en: 'Healing Potion' },
    iconUrl: '',
    sections: ['crafts'],
    purchasePriceCopper: null,
    salePriceCopper: 100,
    recipe: null,
  },
  bag: {
    id: 'bag',
    name: 'Шерстяная сумка',
    names: { ru: 'Шерстяная сумка', en: 'Wool Bag' },
    iconUrl: '',
    sections: ['crafts'],
    purchasePriceCopper: null,
    salePriceCopper: 200,
    recipe: null,
  },
}

describe('ItemsPage', () => {
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
  const mockListLayout = () => {
    const list = screen.getByText('Лечебное зелье').closest('.item-list')
    if (!(list instanceof HTMLElement)) throw new Error('Нет списка')
    const trees = list.querySelectorAll(':scope > .item-tree')
    vi.spyOn(list, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 90, 1000, trees.length * 70 + 10),
    )
    trees.forEach((tree, index) => {
      vi.spyOn(tree, 'getBoundingClientRect').mockReturnValue(
        new DOMRect(0, 100 + index * 70, 1000, 60),
      )
    })
    return list
  }

  const pointerAt = (
    type: 'pointerDown' | 'pointerMove' | 'pointerUp' | 'pointerCancel',
    target: Element | Document,
    y: number,
    x = 50,
  ) => {
    const event = createEvent[type](target)
    if (type === 'pointerDown' && target instanceof HTMLElement) {
      target.setPointerCapture = vi.fn()
      target.hasPointerCapture = vi.fn(() => false)
    }
    Object.defineProperties(event, {
      clientX: { value: x },
      clientY: { value: y },
      pointerId: { value: 1 },
      button: { value: 0 },
      pointerType: { value: 'mouse' },
    })
    fireEvent(target, event)
  }

  const rootNames = () =>
    screen
      .getAllByRole('button', {
        name: /^Редактировать (Лечебное зелье|Шерстяная сумка)$/,
      })
      .map((button) => button.getAttribute('aria-label'))

  it.each(['crafts', 'reagents', 'favorites'] as const)(
    'плавно переставляет строки в %s и сохраняет порядок после открытия',
    (section) => {
      vi.useFakeTimers()
      setTestCraftState({
        items: Object.fromEntries(
          Object.entries(items).map(([id, item]) => [
            id,
            { ...item, sections: ['crafts', 'reagents'], isFavorite: true },
          ]),
        ),
      })
      const view = render(<ItemsPage section={section} />)
      const list = mockListLayout()
      const source = screen.getByText('Шерстяная сумка').closest('article')
      if (!source) throw new Error('Нет строки')
      pointerAt('pointerDown', source, 200)
      pointerAt('pointerMove', document, 115)
      expect(list.querySelector('.item-list__drop-gap')).toHaveStyle({
        top: '10px',
        height: '60px',
      })
      expect(list.querySelector('.item-tree')).toHaveStyle({
        transform: 'translateY(70px)',
      })
      expect(rootNames()[0]).toBe('Редактировать Лечебное зелье')
      pointerAt('pointerUp', document, 115)
      expect(source.closest('.item-tree')).toHaveClass('item-tree--settling')
      act(() => {
        vi.advanceTimersByTime(200)
      })
      expect(rootNames()).toEqual([
        'Редактировать Шерстяная сумка',
        'Редактировать Лечебное зелье',
      ])
      expect(list.querySelector('.item-list__drop-gap')).not.toBeInTheDocument()
      expect(source.closest('.item-tree')).toHaveAttribute('style', '')
      view.unmount()
      render(<ItemsPage section={section} />)
      expect(rootNames()[0]).toBe('Редактировать Шерстяная сумка')
    },
  )

  it.each(['escape', 'outside', 'cancel'] as const)(
    'отменяет перенос через %s, не меняя сохранённый порядок',
    (method) => {
      vi.useFakeTimers()
      render(<ItemsPage section="crafts" />)
      const list = mockListLayout()
      const source = screen.getByText('Шерстяная сумка').closest('article')
      if (!source) throw new Error('Нет строки')
      pointerAt('pointerDown', source, 200)
      pointerAt('pointerMove', document, 115)
      if (method === 'escape') fireEvent.keyDown(document, { key: 'Escape' })
      else if (method === 'cancel') pointerAt('pointerCancel', document, 115)
      else pointerAt('pointerUp', document, 115, 1500)
      act(() => {
        vi.advanceTimersByTime(200)
      })
      expect(rootNames()[0]).toBe('Редактировать Лечебное зелье')
      expect(list).not.toHaveClass('item-list--dragging')
      expect(list.querySelector('.item-list__drop-gap')).not.toBeInTheDocument()
    },
  )

  it('переносит раскрытое дерево целиком и не сворачивает его кликом после отпускания', () => {
    vi.useFakeTimers()
    const potion = items.potion
    if (!potion) throw new Error('Нет предмета')
    setTestCraftState({
      items: {
        ...items,
        potion: {
          ...potion,
          recipe: {
            outputQuantity: 1,
            profession: null,
            reagents: [{ itemId: 'bag', quantity: 1, acquisition: 'buy' }],
          },
        },
      },
    })
    render(<ItemsPage section="crafts" />)
    const source = screen.getByRole('button', { name: 'Развернуть рецепт' })
    fireEvent.click(source)
    const branch = source.closest('.item-tree')?.querySelector('.item-tree__expansion')
    if (!branch) throw new Error('Нет раскрытой ветки')
    fireEvent.animationEnd(branch)
    expect(branch).not.toHaveClass('item-tree__expansion--opening')
    const list = mockListLayout()
    const trees = list.querySelectorAll(':scope > .item-tree')
    if (!trees[0] || !trees[1]) throw new Error('Нет деревьев')
    vi.spyOn(trees[0], 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 100, 1000, 200),
    )
    vi.spyOn(trees[1], 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 310, 1000, 60),
    )
    vi.spyOn(list, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 90, 1000, 290))
    pointerAt('pointerDown', source, 130)
    pointerAt('pointerMove', document, 235)
    expect(trees[1]).toHaveStyle({ transform: 'translateY(-210px)' })
    expect(list.querySelector('.item-list__drop-gap')).toHaveStyle({ height: '200px' })
    pointerAt('pointerUp', document, 235)
    fireEvent.click(source)
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(source).toHaveAttribute('aria-expanded', 'true')
    expect(source.closest('.item-tree')?.querySelector('.item-tree__expansion')).toBe(
      branch,
    )
    expect(branch).not.toHaveClass('item-tree__expansion--opening')
    const state = useCraftStore.getState()
    expect(state.workspaces[state.activeVersion].rootItemOrder?.crafts).toEqual([
      'bag',
      'potion',
    ])
  })

  it('не начинает перенос от небольшого движения при обычном клике', () => {
    render(<ItemsPage section="crafts" />)
    const list = mockListLayout()
    const source = screen.getByText('Лечебное зелье').closest('article')
    if (!source) throw new Error('Нет строки')
    pointerAt('pointerDown', source, 130)
    pointerAt('pointerMove', document, 132)
    pointerAt('pointerUp', document, 132)
    expect(list).not.toHaveClass('item-list--dragging')
    expect(list.querySelector('.item-list__drop-gap')).not.toBeInTheDocument()
  })

  it.each([235, 305, 400])(
    'принимает отпускание в промежутке на высоте %s, включая конец списка',
    (y) => {
      vi.useFakeTimers()
      const extra = items.potion
      if (!extra) throw new Error('Нет предмета')
      setTestCraftState({
        items: {
          ...items,
          extra: {
            ...extra,
            id: 'extra',
            name: 'Янтарь',
            names: { ru: 'Янтарь', en: null },
          },
        },
      })
      render(<ItemsPage section="crafts" />)
      const list = mockListLayout()
      const source = screen.getByText('Лечебное зелье').closest('article')
      if (!source) throw new Error('Нет строки')
      pointerAt('pointerDown', source, 130)
      pointerAt('pointerMove', document, y)
      expect(list.querySelector('.item-list__drop-gap')).toBeInTheDocument()
      pointerAt('pointerUp', document, y)
      act(() => {
        vi.advanceTimersByTime(200)
      })
      const state = useCraftStore.getState()
      expect(state.workspaces[state.activeVersion].rootItemOrder?.crafts).toEqual(
        y === 235 ? ['bag', 'potion', 'extra'] : ['bag', 'extra', 'potion'],
      )
    },
  )

  it('принимает отпускание выше начала списка', () => {
    vi.useFakeTimers()
    render(<ItemsPage section="crafts" />)
    const list = mockListLayout()
    const source = screen.getByText('Шерстяная сумка').closest('article')
    if (!source) throw new Error('Нет строки')
    pointerAt('pointerDown', source, 200)
    pointerAt('pointerMove', document, 60)
    expect(list.querySelector('.item-list__drop-gap')).toHaveStyle({ top: '10px' })
    pointerAt('pointerUp', document, 60)
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(rootNames()[0]).toBe('Редактировать Шерстяная сумка')
    expect(list).not.toHaveClass('item-list--dragging')
    expect(list.querySelector('.item-list__drop-gap')).not.toBeInTheDocument()
  })

  it('прокручивает у обоих краёв без движения мыши, останавливается при отпускании и размонтировании', () => {
    vi.useFakeTimers()
    const frames = new Map<number, FrameRequestCallback>()
    let nextId = 0
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(++nextId, callback)
      return nextId
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id)
    })
    const distances: number[] = []
    const scroll = vi
      .spyOn(window, 'scrollBy')
      .mockImplementation((options: ScrollToOptions | number) => {
        if (typeof options === 'object') distances.push(options.top ?? 0)
      })
    const tick = (time: number) => {
      const entry = frames.entries().next().value
      if (!entry) throw new Error('Нет кадра прокрутки')
      frames.delete(entry[0])
      act(() => {
        entry[1](time)
      })
    }
    const view = render(<ItemsPage section="crafts" />)
    const list = mockListLayout()
    const source = screen.getByText('Шерстяная сумка').closest('article')
    if (!source) throw new Error('Нет строки')
    pointerAt('pointerDown', source, 200)
    pointerAt('pointerMove', document, window.innerHeight - 5)
    tick(16)
    tick(32)
    expect(scroll).toHaveBeenCalledTimes(2)
    expect(distances.at(-1)).toBeGreaterThan(0)
    pointerAt('pointerMove', document, 5)
    tick(48)
    expect(distances.at(-1)).toBeLessThan(0)
    scroll.mockClear()
    pointerAt('pointerMove', document, 165)
    tick(64)
    expect(scroll).not.toHaveBeenCalled()
    pointerAt('pointerUp', document, 115)
    expect(frames.size).toBe(0)
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(list.querySelector('.item-list__drop-gap')).not.toBeInTheDocument()
    pointerAt('pointerDown', source, 200)
    pointerAt('pointerMove', document, 115)
    expect(frames.size).toBe(1)
    view.unmount()
    expect(frames.size).toBe(0)
  })

  it('переставляет с клавиатуры при поиске, сохраняя скрытые строки', async () => {
    const user = userEvent.setup()
    const hidden = items.potion
    if (!hidden) throw new Error('Нет тестового предмета')
    setTestCraftState({
      items: {
        ...items,
        hidden: {
          ...hidden,
          id: 'hidden',
          name: 'Скрытый',
          names: { ru: 'Скрытый', en: null },
        },
      },
    })
    render(<ItemsPage section="crafts" />)
    await user.type(screen.getByRole('searchbox'), 'o')
    expect(screen.queryByText('Скрытый')).not.toBeInTheDocument()
    const row = screen.getByText('Шерстяная сумка').closest('article')
    if (!row) throw new Error('Нет строки')
    row.focus()
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}')
    expect(rootNames()[0]).toBe('Редактировать Шерстяная сумка')
    await user.clear(screen.getByRole('searchbox'))
    expect(screen.getByText('Скрытый')).toBeVisible()
    const state = useCraftStore.getState()
    expect(state.workspaces[state.activeVersion].rootItemOrder?.crafts).toEqual([
      'bag',
      'potion',
      'hidden',
    ])
  })

  it('кнопки и поля цены не начинают перенос', async () => {
    const user = userEvent.setup()
    render(<ItemsPage section="crafts" />)
    await user.click(screen.getByRole('button', { name: 'Редактировать цены' }))
    const input = screen.getByRole('spinbutton', {
      name: /Цена продажи.*Лечебное зелье.*Золото/i,
    })
    const row = input.closest('article')
    if (!row) throw new Error('Нет строки')
    pointerAt('pointerDown', input, 130)
    pointerAt('pointerMove', document, 200)
    pointerAt('pointerUp', document, 200)
    expect(row.closest('.item-list')).not.toHaveClass('item-list--dragging')
    const dataTransfer = { setData: vi.fn(), setDragImage: vi.fn() }
    fireEvent.mouseDown(input, { button: 0 })
    expect(fireEvent.dragStart(row, { dataTransfer })).toBe(false)
    expect(dataTransfer.setData).not.toHaveBeenCalled()
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

  it.each(['crafts', 'reagents'] as const)(
    'показывает покупку в корневой строке только для раздела реагентов: %s',
    (section) => {
      setTestCraftState({
        items: Object.fromEntries(
          Object.entries(items).map(([id, item]) => [
            id,
            { ...item, sections: [section] },
          ]),
        ),
      })
      render(<ItemsPage section={section} />)
      const row = screen.getByText('Лечебное зелье').closest('article')
      if (!row) throw new Error('Нет корневой строки')
      expect(within(row).queryByText('Покупка') !== null).toBe(section === 'reagents')
      expect(within(row).getByText('Крафт')).toBeVisible()
      expect(within(row).getByText('Продажа')).toBeVisible()
    },
  )

  it.each(['crafts', 'reagents'] as const)(
    'ищет оба названия в разделе %s при любом языке отображения',
    async (section) => {
      const user = userEvent.setup()
      setTestCraftState({
        items: Object.fromEntries(
          Object.entries(items).map(([id, item]) => [
            id,
            { ...item, sections: [section] },
          ]),
        ),
      })
      render(<ItemsPage section={section} />)
      const search = screen.getByRole('searchbox')
      await user.type(search, 'HEALING')
      expect(screen.getByText('Лечебное зелье')).toBeVisible()
      expect(screen.queryByText('Шерстяная сумка')).not.toBeInTheDocument()
      act(() => {
        useCraftStore.getState().setItemLanguage('en')
      })
      expect(search).toHaveValue('HEALING')
      expect(screen.getByText('Healing Potion')).toBeVisible()
      await user.clear(search)
      await user.type(search, 'ЛЕЧЕБНОЕ')
      expect(screen.getByText('Healing Potion')).toBeVisible()
    },
  )

  it('меняет язык раскрытого дерева без потери раскрытия и показывает доступное имя без перевода', async () => {
    const user = userEvent.setup()
    const potion = items.potion
    const bag = items.bag
    if (potion === undefined || bag === undefined)
      throw new Error('Нет тестовых предметов')
    setTestCraftState({
      items: {
        potion: {
          ...potion,
          recipe: {
            outputQuantity: 1,
            profession: null,
            reagents: [{ itemId: 'bag', quantity: 2, acquisition: 'buy' }],
          },
        },
        bag: { ...bag, sections: ['reagents'], names: { ru: null, en: 'Wool Bag' } },
      },
    })
    render(<ItemsPage section="crafts" />)
    await user.click(screen.getByRole('button', { name: 'Развернуть рецепт' }))
    expect(screen.getByText('Wool Bag')).toBeVisible()
    act(() => {
      useCraftStore.getState().setItemLanguage('en')
    })
    expect(screen.getByText('Healing Potion')).toBeVisible()
    expect(screen.getByText('Wool Bag')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Свернуть рецепт' })).toBeVisible()
  })

  beforeEach(() => {
    useCraftStore.getState().replaceData(testCraftData({ items, itemLanguage: 'ru' }))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it.each(['crafts', 'reagents'] as const)(
    'открывает импорт по умолчанию и сохраняет ручной предмет в разделе %s',
    async (section) => {
      const user = userEvent.setup()
      const addLabel = section === 'crafts' ? 'Добавить крафт' : 'Добавить реагент'
      render(<ItemsPage section={section} />)
      expect(
        screen.queryByRole('button', { name: 'Импорт из Wowhead' }),
      ).not.toBeInTheDocument()
      const opener = screen.getByRole('button', { name: `+ ${addLabel}` })
      await user.click(opener)
      expect(screen.getAllByRole('dialog')).toHaveLength(1)
      expect(screen.getByText('База Forever')).toBeVisible()
      const before =
        useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items
      await user.click(screen.getByRole('button', { name: 'Добавить вручную' }))
      expect(screen.getByRole('checkbox', { name: 'Крафты' })).toHaveProperty(
        'checked',
        section === 'crafts',
      )
      expect(screen.getByRole('checkbox', { name: 'Реагенты' })).toHaveProperty(
        'checked',
        section === 'reagents',
      )
      await user.type(screen.getByLabelText('Название RU'), 'Новый предмет')
      expect(
        useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items,
      ).toBe(before)
      await user.click(screen.getByRole('button', { name: 'Сохранить' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(opener).toHaveFocus()
      expect(screen.getByText('Новый предмет')).toBeVisible()
      expect(
        Object.values(
          useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion]
            .items,
        ),
      ).toContainEqual(
        expect.objectContaining({ name: 'Новый предмет', sections: [section] }),
      )
    },
  )

  it.each(['crafts', 'reagents'] as const)(
    'открывает общую модалку из пустого раздела %s и отменяет без записи',
    async (section) => {
      setTestCraftState({ items: {} })
      const before = useCraftStore.getState()
      const user = userEvent.setup()
      render(<ItemsPage section={section} />)
      const addLabel = section === 'crafts' ? 'Добавить крафт' : 'Добавить реагент'
      const opener = screen.getByRole('button', { name: addLabel })
      await user.click(opener)
      expect(screen.getByText('База Forever')).toBeVisible()
      await user.click(screen.getByRole('button', { name: 'Добавить вручную' }))
      await user.type(screen.getByLabelText('Название RU'), 'Черновик')
      await user.keyboard('{Escape}')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(opener).toHaveFocus()
      expect(useCraftStore.getState()).toBe(before)
    },
  )

  it('отменяет черновики без изменения каталога и сохраняет неизменённые цены без записи', async () => {
    const user = userEvent.setup()
    render(<ItemsPage section="crafts" />)
    const before = useCraftStore.getState()
    const setItem = vi.spyOn(Storage.prototype, 'setItem')

    await user.click(screen.getByRole('button', { name: 'Редактировать цены' }))
    const group = screen.getByRole('group', { name: 'Цена продажи: Лечебное зелье' })
    const copper = within(group).getByRole('spinbutton', { name: /медь$/ })
    await user.clear(copper)
    await user.type(copper, '50')
    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(useCraftStore.getState()).toBe(before)

    await user.click(screen.getByRole('button', { name: 'Редактировать цены' }))
    expect(
      within(
        screen.getByRole('group', { name: 'Цена продажи: Лечебное зелье' }),
      ).getByRole('spinbutton', { name: /серебро$/ }),
    ).toHaveValue(1)
    await user.click(screen.getByRole('button', { name: 'Сохранить все' }))
    expect(useCraftStore.getState()).toBe(before)
    expect(setItem).not.toHaveBeenCalled()
  })

  it.each(['crafts', 'reagents'] as const)(
    'сохраняет черновики цен раздела %s одной записью, различая null и ноль',
    async (section) => {
      const user = userEvent.setup()
      const field = section === 'crafts' ? 'salePriceCopper' : 'purchasePriceCopper'
      const catalog = Object.fromEntries(
        Object.entries(items).map(([id, item]) => [
          id,
          {
            ...item,
            sections: [section],
            purchasePriceCopper: 300,
            ...(id === 'potion' ? { [field]: null } : {}),
          },
        ]),
      )
      setTestCraftState({ items: catalog })
      const before =
        useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items
      render(<ItemsPage section={section} />)
      const setItem = vi.spyOn(Storage.prototype, 'setItem')

      await user.click(screen.getByRole('button', { name: 'Редактировать цены' }))
      const groups = screen.getAllByRole('group', { name: /^Цена / })
      const first = groups[0]
      const second = groups[1]
      if (first === undefined || second === undefined) {
        throw new Error('Не найдены поля двух цен')
      }
      expect(
        screen.queryByRole('checkbox', { name: 'Указать цену' }),
      ).not.toBeInTheDocument()
      for (const input of within(first).getAllByRole('spinbutton')) {
        expect(input).toBeEnabled()
      }
      for (const input of within(second).getAllByRole('spinbutton')) {
        await user.clear(input)
        await user.type(input, '0')
      }
      expect(
        useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items,
      ).toBe(before)
      expect(setItem).not.toHaveBeenCalled()

      await user.click(screen.getByRole('button', { name: 'Сохранить все' }))

      expect(
        useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items
          .potion,
      ).toEqual({
        ...before.potion,
        [field]: null,
      })
      expect(
        useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items
          .bag,
      ).toEqual({
        ...before.bag,
        [field]: 0,
      })
      expect(
        setItem.mock.calls.filter(([key]) => key === 'craft-calc-versioned-data'),
      ).toHaveLength(1)
      expect(screen.getByRole('button', { name: 'Редактировать цены' })).toBeVisible()
    },
  )

  it.each(['crafts', 'reagents'] as const)(
    'вводит ранее неизвестную цену без разблокировки в разделе %s',
    async (section) => {
      const user = userEvent.setup()
      const field = section === 'crafts' ? 'salePriceCopper' : 'purchasePriceCopper'
      const potion = items.potion
      if (potion === undefined) throw new Error('Нет тестового предмета')
      setTestCraftState({
        items: { potion: { ...potion, sections: [section], [field]: null } },
      })
      render(<ItemsPage section={section} />)
      await user.click(screen.getByRole('button', { name: 'Редактировать цены' }))
      const group = screen.getByRole('group', { name: /^Цена / })
      expect(within(group).queryByRole('checkbox')).not.toBeInTheDocument()
      const gold = within(group).getByRole('spinbutton', { name: /золото$/ })
      expect(gold).toBeEnabled()
      await user.type(gold, '2')
      expect(useCraftStore.getState().workspaces.forever.items.potion?.[field]).toBeNull()
      await user.click(screen.getByRole('button', { name: 'Сохранить все' }))
      expect(useCraftStore.getState().workspaces.forever.items.potion?.[field]).toBe(
        20000,
      )
    },
  )

  it('фильтрует предметы по названию без учёта регистра', async () => {
    const user = userEvent.setup()

    render(<ItemsPage section="crafts" />)

    const search = screen.getByRole('searchbox', {
      name: 'Поиск по названию предмета',
    })

    await user.type(search, 'ЗЕЛЬЕ')

    expect(screen.getByText('Лечебное зелье')).toBeVisible()
    expect(screen.queryByText('Шерстяная сумка')).not.toBeInTheDocument()

    await user.clear(search)
    await user.type(search, 'руда')

    expect(screen.getByText('Ничего не найдено')).toBeVisible()
  })

  it.each<{
    acquisition: AcquisitionMethod
    materialPrice: number | null
    quantity: number
    unitText: string
    totalText: string | null
  }>([
    {
      acquisition: 'craft',
      materialPrice: 1,
      quantity: 2,
      unitText: '1ммеди',
      totalText: '1ммеди',
    },
    {
      acquisition: 'craft',
      materialPrice: 1,
      quantity: 3,
      unitText: '1ммеди',
      totalText: '2ммеди',
    },
    {
      acquisition: 'buy',
      materialPrice: 1,
      quantity: 2,
      unitText: '0ммеди',
      totalText: '−1ммеди',
    },
    {
      acquisition: 'craft',
      materialPrice: 3,
      quantity: 3,
      unitText: '0ммеди',
      totalText: '−1ммеди',
    },
    {
      acquisition: 'craft',
      materialPrice: 5,
      quantity: 2,
      unitText: '−1ммеди',
      totalText: '−3ммеди',
    },
    {
      acquisition: 'auto',
      materialPrice: 1,
      quantity: 2,
      unitText: '1ммеди',
      totalText: '1ммеди',
    },
    {
      acquisition: 'craft',
      materialPrice: null,
      quantity: 2,
      unitText: 'не указано',
      totalText: null,
    },
  ])(
    'показывает округлённую единицу и точную сумму: $acquisition, цена $materialPrice, количество $quantity',
    async ({ acquisition, materialPrice, quantity, unitText, totalText }) => {
      const user = userEvent.setup()
      const catalog: ItemCatalog = {
        dust: {
          id: 'dust',
          name: 'Пыль',
          iconUrl: '',
          sections: ['reagents'],
          purchasePriceCopper: materialPrice,
          salePriceCopper: null,
          recipe: null,
        },
        thread: {
          id: 'thread',
          name: 'Нить',
          iconUrl: '',
          sections: ['reagents'],
          purchasePriceCopper: 1,
          salePriceCopper: null,
          recipe: {
            outputQuantity: 2,
            profession: 'tailoring',
            reagents: [{ itemId: 'dust', quantity: 1, acquisition: 'buy' }],
          },
        },
        bag: {
          id: 'bag',
          name: 'Шерстяная сумка',
          iconUrl: '',
          sections: ['crafts'],
          purchasePriceCopper: null,
          salePriceCopper: 200,
          recipe: {
            outputQuantity: 1,
            profession: 'tailoring',
            reagents: [{ itemId: 'thread', quantity, acquisition }],
          },
        },
      }
      setTestCraftState({ items: catalog, ownedProfessions: ['tailoring'] })
      render(<ItemsPage section="crafts" />)

      await user.click(screen.getByRole('button', { name: 'Развернуть рецепт' }))

      const profit = screen.getByText('Выгода').parentElement
      if (profit === null) {
        throw new Error('Не найдена выгода реагента')
      }
      expect(profit.querySelector('dd > .money-display')).toHaveTextContent(unitText)
      if (totalText === null) {
        expect(within(profit).queryByRole('tooltip')).not.toBeInTheDocument()
      } else {
        const tooltip = within(profit).getByRole('tooltip')
        expect(tooltip).toHaveTextContent(
          `Суммарно за ${String(quantity)} шт.: ${totalText}`,
        )
      }
    },
  )
})
